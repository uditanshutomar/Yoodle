import { Queue, Worker, Job } from "bullmq";
import { getRedisClient } from "@/lib/redis/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs");

// -- Connection options -------------------------------------------------------

function getConnection(): {
  host: string;
  port: number;
  password?: string;
  db: number;
} {
  const client = getRedisClient();
  return {
    host: client.options.host || "localhost",
    port: client.options.port || 6379,
    password: client.options.password,
    db: client.options.db || 0,
  };
}

// -- Queue Names --------------------------------------------------------------

export const QUEUE_NAMES = {
  MEETING_CLEANUP: "meeting-cleanup",
  RECORDING_PROCESS: "recording-process",
  USAGE_AGGREGATE: "usage-aggregate",
  TOKEN_REFRESH: "token-refresh",
  VM_LIFECYCLE: "vm-lifecycle",
} as const;

// -- Queue Factory ------------------------------------------------------------

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  queues.set(name, queue);
  return queue;
}

// -- Worker Factory -----------------------------------------------------------

const workers = new Map<string, Worker>();

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options: { concurrency?: number } = {},
): Worker<T> {
  const existing = workers.get(queueName);
  if (existing) {
    log.warn({ queueName }, "Worker already exists — returning existing");
    return existing as Worker<T>;
  }

  const worker = new Worker<T>(queueName, processor, {
    connection: getConnection(),
    concurrency: options.concurrency || 1,
  });

  worker.on("completed", (job) => {
    log.info({ jobId: job.id, queue: queueName }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, queue: queueName, err }, "Job failed");
  });

  worker.on("error", (err) => {
    log.error({ queue: queueName, err }, "Worker error");
  });

  workers.set(queueName, worker);
  return worker;
}

// -- Cron Job Registration ----------------------------------------------------

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Register all recurring cron jobs.
 * Call once on server startup.
 */
export async function registerCronJobs(): Promise<void> {
  const meetingQueue = getQueue(QUEUE_NAMES.MEETING_CLEANUP);
  const usageQueue = getQueue(QUEUE_NAMES.USAGE_AGGREGATE);
  const tokenQueue = getQueue(QUEUE_NAMES.TOKEN_REFRESH);
  const vmQueue = getQueue(QUEUE_NAMES.VM_LIFECYCLE);

  await meetingQueue.upsertJobScheduler(
    "cleanup-stale-meetings",
    { every: FIVE_MINUTES },
    { name: "cleanup-stale-meetings" },
  );

  await usageQueue.upsertJobScheduler(
    "aggregate-usage",
    { every: ONE_HOUR },
    { name: "aggregate-usage" },
  );

  await tokenQueue.upsertJobScheduler(
    "refresh-expiring-tokens",
    { every: SIX_HOURS },
    { name: "refresh-expiring-tokens" },
  );

  await vmQueue.upsertJobScheduler(
    "check-idle-vms",
    { every: FIFTEEN_MINUTES },
    { name: "check-idle-vms" },
  );

  log.info("Registered all cron job schedulers");
}

// -- Graceful Shutdown --------------------------------------------------------

export async function closeAllQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [name, worker] of workers) {
    log.info({ queue: name }, "Closing worker...");
    closePromises.push(worker.close());
  }

  for (const [name, queue] of queues) {
    log.info({ queue: name }, "Closing queue...");
    closePromises.push(queue.close());
  }

  await Promise.all(closePromises);
  workers.clear();
  queues.clear();
  log.info("All queues and workers closed");
}

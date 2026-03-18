import { Queue } from "bullmq";
import { createLogger } from "@/lib/infra/logger";

const logger = createLogger("jobs:queue");

// -- Connection options -------------------------------------------------------

/**
 * Parse Redis connection config directly from REDIS_URL instead of
 * reaching into ioredis client internals (which are not part of the
 * public API and can change between versions).
 */
function getConnection(): {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
  tls?: Record<string, unknown>;
} {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const useTls = redisUrl.startsWith("rediss://");

  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname || "localhost",
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    maxRetriesPerRequest: null, // Required by BullMQ
    ...(useTls ? { tls: {} } : {}),
  };
}

// -- Queue Names --------------------------------------------------------------

export const QUEUE_NAMES = {
  RECORDING_PROCESS: "recording-process",
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

/**
 * Close all cached queues. Call during graceful shutdown to release
 * Redis connections held by BullMQ.
 */
export async function closeAllQueues(): Promise<void> {
  const entries = Array.from(queues.entries());
  const results = await Promise.allSettled(
    entries.map(([, q]) => q.close()),
  );
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      logger.error(
        { err: (results[i] as PromiseRejectedResult).reason, queue: entries[i][0] },
        "Failed to close queue during shutdown",
      );
    }
  }
  queues.clear();
}

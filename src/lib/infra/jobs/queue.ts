import { Queue } from "bullmq";
import { getConnection } from "./connection";
import { createLogger } from "@/lib/infra/logger";

const logger = createLogger("jobs:queue");

// -- Queue Names --------------------------------------------------------------

export const QUEUE_NAMES = {
  RECORDING_PROCESS: "recording-process",
  POST_MEETING_CASCADE: "post-meeting-cascade",
  CALENDAR_SYNC: "calendar-sync",
} as const;

// -- Queue Factory ------------------------------------------------------------

const queues = new Map<string, Queue>();

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export function getQueue(name: QueueName): Queue {
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

import { Queue } from "bullmq";

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
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.allSettled(closePromises);
  queues.clear();
}

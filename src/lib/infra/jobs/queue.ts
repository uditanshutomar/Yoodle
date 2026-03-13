import { Queue } from "bullmq";
import { getRedisClient } from "@/lib/infra/redis/client";

// -- Connection options -------------------------------------------------------

function getConnection(): {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
  tls?: Record<string, unknown>;
} {
  const client = getRedisClient();
  const useTls = (process.env.REDIS_URL || "").startsWith("rediss://");
  return {
    host: client.options.host || "localhost",
    port: client.options.port || 6379,
    password: client.options.password,
    db: client.options.db || 0,
    maxRetriesPerRequest: null, // Required by BullMQ
    ...(useTls ? { tls: {} } : {}), // Forward TLS for Upstash
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

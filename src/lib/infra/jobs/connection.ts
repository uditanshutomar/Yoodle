/**
 * Shared Redis connection config for BullMQ queues and workers.
 *
 * Both producers (queue.ts) and consumers (start-workers.ts) must use
 * the same Redis instance. This module is the single source of truth.
 */

export interface BullMQConnectionOptions {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
  tls?: Record<string, unknown>;
}

/**
 * Parse Redis connection config from REDIS_URL.
 *
 * Reads directly from the URL instead of reaching into ioredis client
 * internals (which are not part of the public API).
 */
export function getConnection(): BullMQConnectionOptions {
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

import Redis from "ioredis";
import { createLogger } from "@/lib/infra/logger";

const logger = createLogger("redis-client");

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (redis) return redis;

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null; // Stop retrying after 10 attempts
      return Math.min(times * 200, 5000); // Exponential backoff, max 5s
    },
    reconnectOnError(err) {
      // Reconnect on READONLY errors (failover scenario)
      return err.message.includes("READONLY");
    },
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Connection error");
  });

  redis.on("connect", () => {
    logger.info("Connected successfully");
  });

  redis.on("reconnecting", () => {
    logger.warn("Reconnecting...");
  });

  // When retry strategy returns null ioredis emits "end" and the client
  // becomes permanently dead. Clear the singleton so the next call creates
  // a fresh client that can attempt to reconnect.
  redis.on("end", () => {
    logger.warn("Connection ended (retries exhausted). Clearing singleton for next reconnect attempt.");
    redis = null;
  });

  return redis;
}

/**
 * Check if Redis is available and connected.
 * Returns false if Redis is not configured or unreachable — features
 * that depend on Redis should gracefully degrade.
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === "PONG";
  } catch (err) {
    logger.warn({ err }, "Redis availability check failed");
    return false;
  }
}

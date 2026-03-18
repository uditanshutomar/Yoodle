import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("proactive-insights");

const KEY_PREFIX = "proactive:unseen:";
const TTL_SECONDS = 86400;

export async function getUnseenCount(userId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const val = await redis.get(`${KEY_PREFIX}${userId}`);
    return val ? parseInt(val, 10) : 0;
  } catch (err) {
    log.warn({ err, userId }, "Failed to get unseen count — returning 0");
    return 0;
  }
}

export async function incrementUnseen(userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${KEY_PREFIX}${userId}`;
    // Pipeline both operations into a single round-trip for atomicity
    await redis.multi().incr(key).expire(key, TTL_SECONDS).exec();
  } catch (err) {
    log.warn({ err, userId }, "Failed to increment unseen count");
  }
}

export async function clearUnseen(userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`${KEY_PREFIX}${userId}`);
  } catch (err) {
    log.warn({ err, userId }, "Failed to clear unseen count");
  }
}

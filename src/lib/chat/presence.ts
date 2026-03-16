import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("presence");
const PRESENCE_TTL = 30; // seconds
const PRESENCE_PREFIX = "presence:";

/**
 * Mark a user as online. Call on page load and every 20s as heartbeat.
 */
export async function setUserOnline(userId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(`${PRESENCE_PREFIX}${userId}`, "online", "EX", PRESENCE_TTL);
  } catch (error) {
    log.error({ error, userId }, "Failed to set user online");
  }
}


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

/**
 * Check if a user is online (has a valid presence key).
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const status = await redis.get(`${PRESENCE_PREFIX}${userId}`);
    return status === "online";
  } catch {
    return false;
  }
}

/**
 * Check online status for multiple users at once.
 */
export async function getOnlineStatuses(userIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (userIds.length === 0) return result;
  try {
    const redis = getRedisClient();
    const keys = userIds.map((id) => `${PRESENCE_PREFIX}${id}`);
    const statuses = await redis.mget(...keys);
    userIds.forEach((id, i) => {
      result.set(id, statuses[i] === "online");
    });
  } catch {
    userIds.forEach((id) => result.set(id, false));
  }
  return result;
}

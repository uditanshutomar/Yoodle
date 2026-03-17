import { getRedisClient } from "@/lib/infra/redis/client";

const KEY_PREFIX = "proactive:unseen:";
const TTL_SECONDS = 86400;

export async function getUnseenCount(userId: string): Promise<number> {
  const redis = getRedisClient();
  const val = await redis.get(`${KEY_PREFIX}${userId}`);
  return val ? parseInt(val, 10) : 0;
}

export async function incrementUnseen(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${userId}`;
  await redis.incr(key);
  await redis.expire(key, TTL_SECONDS);
}

export async function clearUnseen(userId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${KEY_PREFIX}${userId}`);
}

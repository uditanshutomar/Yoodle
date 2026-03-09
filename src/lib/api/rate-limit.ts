import { NextRequest } from "next/server";
import { getRedisClient } from "../redis/client";
import { RateLimitError } from "./errors";

interface RateLimitConfig {
  /** Max number of requests in the window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

/** Rate limit presets for different endpoint groups */
export const RATE_LIMITS = {
  auth: { limit: 5, window: 60 } as RateLimitConfig,
  ai: { limit: 20, window: 60 } as RateLimitConfig,
  voice: { limit: 10, window: 60 } as RateLimitConfig,
  meetings: { limit: 60, window: 60 } as RateLimitConfig,
  general: { limit: 100, window: 60 } as RateLimitConfig,
} as const;

/**
 * Extract a rate-limit key from the request.
 * Uses IP address as the identifier.
 */
function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

/**
 * Check rate limit using Redis sliding window counter.
 * Throws RateLimitError if limit exceeded.
 *
 * Usage:
 *   await checkRateLimit(req, "ai");
 */
export async function checkRateLimit(
  req: NextRequest,
  group: keyof typeof RATE_LIMITS,
): Promise<void> {
  const config = RATE_LIMITS[group];
  const clientKey = getClientKey(req);
  const key = `ratelimit:${group}:${clientKey}`;

  try {
    const client = getRedisClient();
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.window;

    // Sliding window using sorted set
    const pipeline = client.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 10)}`);
    pipeline.zcard(key);
    pipeline.expire(key, config.window);

    const results = await pipeline.exec();
    if (!results) return;

    const count = results[2]?.[1] as number;

    if (count > config.limit) {
      const oldestResult = await client.zrange(key, 0, 0, "WITHSCORES");
      const oldestScore = oldestResult[1]
        ? parseInt(oldestResult[1], 10)
        : now;
      const retryAfter = Math.max(1, oldestScore + config.window - now);

      throw new RateLimitError(retryAfter);
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    // If Redis is down, allow the request (fail-open)
  }
}

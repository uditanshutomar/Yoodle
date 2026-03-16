import { NextRequest } from "next/server";
import { getRedisClient } from "../redis/client";
import { RateLimitError } from "./errors";
import { createLogger } from "../logger";

const log = createLogger("rate-limit");

interface RateLimitConfig {
  /** Max number of requests in the window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

/** Rate limit presets for different endpoint groups */
export const RATE_LIMITS = {
  auth: { limit: 5, window: 60 } as RateLimitConfig, // login, signup, verify
  session: { limit: 30, window: 60 } as RateLimitConfig, // session check, refresh
  ai: { limit: 20, window: 60 } as RateLimitConfig,
  voice: { limit: 10, window: 60 } as RateLimitConfig,
  meetings: { limit: 60, window: 60 } as RateLimitConfig,
  calendar: { limit: 40, window: 60 } as RateLimitConfig,
  general: { limit: 100, window: 60 } as RateLimitConfig,
} as const;

/**
 * Extract a rate-limit key from the request.
 * On Vercel/trusted proxies, x-forwarded-for is reliable.
 * Falls back to x-real-ip, then "unknown".
 */
function getClientKey(req: NextRequest): string {
  // On Vercel, x-forwarded-for is set by the platform and is trustworthy.
  // The first IP in the chain is the client's real IP.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip && isValidIp(ip)) return ip;
  }

  // Fallback to x-real-ip (set by some reverse proxies)
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) return realIp;

  // No identifiable IP — use a per-request hash to avoid a single shared bucket.
  // This means unknown clients each get their own limit (they still get rate-limited
  // but can't share a bucket to collectively DOS a single key).
  const userAgent = req.headers.get("user-agent") || "";
  const accept = req.headers.get("accept") || "";
  return `anon:${simpleHash(userAgent + accept)}`;
}

/** Fast non-crypto hash for rate-limit bucketing (not security-sensitive). */
function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Basic IP format validation (IPv4 or IPv6) */
function isValidIp(ip: string): boolean {
  // IPv4: digits and dots
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true;
  // IPv6: hex digits and colons (simplified check)
  if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":")) return true;
  return false;
}

// ── In-memory fallback when Redis is unavailable ──────────────────────
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Periodically clean up expired entries. unref() prevents this timer
// from keeping the Node.js process alive during graceful shutdown.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of memoryStore) {
    if (val.resetAt <= now) memoryStore.delete(key);
  }
}, 60_000);
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

function checkInMemoryRateLimit(key: string, config: RateLimitConfig): void {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (entry && entry.resetAt > now) {
    entry.count++;
    if (entry.count > config.limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new RateLimitError(retryAfter);
    }
  } else {
    memoryStore.set(key, { count: 1, resetAt: now + config.window * 1000 });
  }
}

/**
 * Check rate limit using Redis sliding window counter.
 * Falls back to in-memory rate limiting if Redis is unavailable.
 * Throws RateLimitError if limit exceeded.
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
    // Redis unavailable — fall back to in-memory rate limiting
    // This prevents unlimited requests when Redis is down
    log.warn({ group }, "Redis unavailable, using in-memory fallback");
    checkInMemoryRateLimit(key, config);
  }
}

import { getRedisClient } from "./client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("redis-cache");

// ─── Waiting Room Admission ────────────────────────────────────────

const ADMISSION_KEY = (roomId: string, userId: string) =>
  `waiting:admitted:${roomId}:${userId}`;

/**
 * Atomically consume an admission token using GETDEL (Redis 6.2+).
 * Prevents two concurrent requests from both consuming the same token.
 */
export async function waitingConsumeAdmission(
  roomId: string,
  userId: string,
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const key = ADMISSION_KEY(roomId, userId);
    // GETDEL atomically retrieves and deletes in a single Redis command
    const result = await client.call("GETDEL", key);
    return result !== null;
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingConsumeAdmission failed");
    // Fail closed — deny admission on Redis outage to prevent unauthorized room joins
    return false;
  }
}

// ─── Token Blacklist ─────────────────────────────────────────────────

/**
 * Blacklist a JWT token (e.g., on logout).
 * TTL should match the token's remaining lifetime.
 */
export async function tokenBlacklist(
  token: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(`token:blacklist:${token}`, "1", "EX", ttlSeconds);
  } catch (err) {
    // Log but don't throw — logout should still proceed client-side
    logger.error({ err }, "Failed to blacklist token");
  }
}

/**
 * Check if a token has been blacklisted.
 * For access tokens (short-lived, 15min): fails open on Redis outage to keep the app usable.
 * For refresh tokens (long-lived, 7 days): fails closed to prevent revoked sessions from reactivating.
 */
export async function tokenIsBlacklisted(
  token: string,
  options?: { failClosed?: boolean },
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const exists = await client.exists(`token:blacklist:${token}`);
    return exists === 1;
  } catch (err) {
    logger.error({ err }, "Token blacklist check failed");
    // Refresh tokens (failClosed=true) should block on Redis outage to prevent
    // revoked 7-day tokens from being reused. Access tokens fail open since
    // they're short-lived (15min) and cryptographically verified.
    return options?.failClosed ?? false;
  }
}

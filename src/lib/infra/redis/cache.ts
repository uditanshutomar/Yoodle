import crypto from "crypto";
import { getRedisClient } from "./client";
import { createLogger } from "@/lib/infra/logger";

/** Hash a token with SHA-256 for use as a Redis key (fixed-length, no token exposure). */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const logger = createLogger("redis-cache");

// ─── Waiting Room ──────────────────────────────────────────────────

const ADMISSION_KEY = (roomId: string, userId: string) =>
  `waiting:admitted:${roomId}:${userId}`;
const DENIAL_KEY = (roomId: string, userId: string) =>
  `waiting:denied:${roomId}:${userId}`;
const QUEUE_KEY = (roomId: string) => `waiting:queue:${roomId}`;

/** TTL for admission/denial tokens — 10 minutes. */
const WAITING_TTL = 600;

/**
 * Grant admission: SET the admission key so the join route can consume it.
 */
export async function waitingGrantAdmission(
  roomId: string,
  userId: string,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(ADMISSION_KEY(roomId, userId), "1", "EX", WAITING_TTL);
    // Also remove from queue
    await client.hdel(QUEUE_KEY(roomId), userId);
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingGrantAdmission failed");
  }
}

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

/**
 * Deny a user from the waiting room.
 */
export async function waitingSetDenied(
  roomId: string,
  userId: string,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(DENIAL_KEY(roomId, userId), "1", "EX", WAITING_TTL);
    await client.hdel(QUEUE_KEY(roomId), userId);
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingSetDenied failed");
  }
}

/**
 * Check a user's waiting room status.
 * Returns "admitted", "denied", or "waiting".
 */
export async function waitingCheckStatus(
  roomId: string,
  userId: string,
): Promise<"admitted" | "denied" | "waiting"> {
  try {
    const client = getRedisClient();
    const [admitted, denied] = await Promise.all([
      client.exists(ADMISSION_KEY(roomId, userId)),
      client.exists(DENIAL_KEY(roomId, userId)),
    ]);
    if (admitted) return "admitted";
    if (denied) return "denied";
    return "waiting";
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingCheckStatus failed");
    return "waiting";
  }
}

/**
 * Add a user to the waiting room queue.
 */
export async function waitingAddToQueue(
  roomId: string,
  userId: string,
  userInfo: { name: string; displayName: string; avatar?: string | null },
): Promise<void> {
  try {
    const client = getRedisClient();
    const data = JSON.stringify({
      name: userInfo.name,
      displayName: userInfo.displayName,
      avatar: userInfo.avatar ?? null,
      joinedWaitingAt: Date.now(),
    });
    await client.hset(QUEUE_KEY(roomId), userId, data);
    // Auto-expire the whole queue after 2 hours
    await client.expire(QUEUE_KEY(roomId), 7200);
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingAddToQueue failed");
  }
}

/**
 * Get all users currently in the waiting room queue.
 */
export async function waitingGetQueue(
  roomId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    displayName: string;
    avatar: string | null;
    joinedWaitingAt: number;
  }>
> {
  try {
    const client = getRedisClient();
    const entries = await client.hgetall(QUEUE_KEY(roomId));
    if (!entries) return [];
    return Object.entries(entries).map(([uid, json]) => {
      const info = JSON.parse(json) as {
        name: string;
        displayName: string;
        avatar: string | null;
        joinedWaitingAt: number;
      };
      return { id: uid, ...info };
    });
  } catch (err) {
    logger.warn({ err, roomId }, "waitingGetQueue failed");
    return [];
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
    await client.set(`token:blacklist:${hashToken(token)}`, "1", "EX", ttlSeconds);
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
    const exists = await client.exists(`token:blacklist:${hashToken(token)}`);
    return exists === 1;
  } catch (err) {
    logger.error({ err }, "Token blacklist check failed");
    // Refresh tokens (failClosed=true) should block on Redis outage to prevent
    // revoked 7-day tokens from being reused. Access tokens fail open since
    // they're short-lived (15min) and cryptographically verified.
    return options?.failClosed ?? false;
  }
}

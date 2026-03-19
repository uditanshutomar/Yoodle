import crypto from "crypto";
import { getRedisClient } from "./client";
import { createLogger } from "@/lib/infra/logger";

/** Hash a token with SHA-256 for use as a Redis key (fixed-length, no token exposure). */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const logger = createLogger("redis-cache");

// ─── Generic Cache Utilities ────────────────────────────────────────────

/** Get a cached value, parsing it as JSON. Returns null on miss or error. */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null; // Cache miss on error — fall through to DB
  }
}

/** Set a cached value with TTL in seconds. Non-fatal on error. */
export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Non-fatal — cache write failure shouldn't break the request
  }
}

/** Invalidate a cached key. Non-fatal on error. */
export async function invalidateCache(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch {
    // Non-fatal
  }
}

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
 * Uses a pipeline for atomicity — both the SET and queue removal happen together.
 * Returns true if the operation succeeded, false on Redis failure.
 */
export async function waitingGrantAdmission(
  roomId: string,
  userId: string,
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pipeline = client.pipeline();
    pipeline.set(ADMISSION_KEY(roomId, userId), "1", "EX", WAITING_TTL);
    pipeline.hdel(QUEUE_KEY(roomId), userId);
    await pipeline.exec();
    return true;
  } catch (err) {
    logger.error({ err, roomId, userId }, "waitingGrantAdmission failed — host thinks user was admitted but Redis write failed");
    return false;
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
 * Uses a pipeline for atomicity. Returns true on success, false on Redis failure.
 */
export async function waitingSetDenied(
  roomId: string,
  userId: string,
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pipeline = client.pipeline();
    pipeline.set(DENIAL_KEY(roomId, userId), "1", "EX", WAITING_TTL);
    pipeline.hdel(QUEUE_KEY(roomId), userId);
    await pipeline.exec();
    return true;
  } catch (err) {
    logger.error({ err, roomId, userId }, "waitingSetDenied failed — host thinks user was denied but Redis write failed");
    return false;
  }
}

/**
 * Check a user's waiting room status.
 * Returns "admitted", "denied", "waiting", or "unknown" on Redis failure.
 * Callers MUST handle "unknown" — returning "waiting" on error would hide
 * a user who was actually admitted or denied.
 */
export async function waitingCheckStatus(
  roomId: string,
  userId: string,
): Promise<"admitted" | "denied" | "waiting" | "unknown"> {
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
    logger.error({ err, roomId, userId }, "waitingCheckStatus failed — cannot determine user status");
    return "unknown";
  }
}

/**
 * Add a user to the waiting room queue.
 * Uses a pipeline for atomicity. Returns true on success, false on Redis failure.
 */
export async function waitingAddToQueue(
  roomId: string,
  userId: string,
  userInfo: { name: string; displayName: string; avatar?: string | null },
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const data = JSON.stringify({
      name: userInfo.name,
      displayName: userInfo.displayName,
      avatar: userInfo.avatar ?? null,
      joinedWaitingAt: Date.now(),
    });
    const pipeline = client.pipeline();
    pipeline.hset(QUEUE_KEY(roomId), userId, data);
    // Auto-expire the whole queue after 2 hours
    pipeline.expire(QUEUE_KEY(roomId), 7200);
    await pipeline.exec();
    return true;
  } catch (err) {
    logger.error({ err, roomId, userId }, "waitingAddToQueue failed — user not added to waiting room");
    return false;
  }
}

/**
 * Get all users currently in the waiting room queue.
 * Returns null on Redis failure — callers should distinguish "empty queue"
 * from "couldn't read queue" to avoid hiding waiting users from the host.
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
  }> | null
> {
  try {
    const client = getRedisClient();
    const entries = await client.hgetall(QUEUE_KEY(roomId));
    if (!entries) return [];
    // Parse per-entry to avoid one corrupt entry taking out the entire queue
    return Object.entries(entries).flatMap(([uid, json]) => {
      try {
        const info = JSON.parse(json) as {
          name: string;
          displayName: string;
          avatar: string | null;
          joinedWaitingAt: number;
        };
        return [{ id: uid, ...info }];
      } catch {
        logger.warn({ uid, roomId, json: json?.slice(0, 100) }, "Corrupt waiting room entry — skipping");
        return [];
      }
    });
  } catch (err) {
    logger.error({ err, roomId }, "waitingGetQueue failed — cannot read waiting room");
    return null;
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

import { getRedisClient } from "./client";

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get a cached value by key. Returns null if not found or Redis unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with optional TTL (seconds).
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttl: number = DEFAULT_TTL,
): Promise<void> {
  try {
    const client = getRedisClient();
    const serialized = JSON.stringify(value);
    if (ttl > 0) {
      await client.set(key, serialized, "EX", ttl);
    } else {
      await client.set(key, serialized);
    }
  } catch {
    // Cache write failure is non-critical — log but don't throw
  }
}

/**
 * Delete a cached value.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch {
    // Non-critical
  }
}

/**
 * Delete all keys matching a pattern (e.g., "user:*").
 * Use sparingly — SCAN is used internally (non-blocking).
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Non-critical
  }
}

// ─── Room State Helpers (replaces in-memory Maps) ────────────────────

const ROOM_KEY = (roomId: string) => `room:${roomId}`;
const CHAT_KEY = (roomId: string) => `chat:${roomId}`;
const RECORDING_KEY = (roomId: string) => `recording:${roomId}`;
const SOCKET_KEY = (socketId: string) => `socket:${socketId}`;

/**
 * Add a user to a room's participant set.
 */
export async function roomAddUser(
  roomId: string,
  userId: string,
  userData: Record<string, unknown>,
): Promise<void> {
  const client = getRedisClient();
  await client.hset(ROOM_KEY(roomId), userId, JSON.stringify(userData));
}

/**
 * Remove a user from a room.
 */
export async function roomRemoveUser(
  roomId: string,
  userId: string,
): Promise<void> {
  const client = getRedisClient();
  await client.hdel(ROOM_KEY(roomId), userId);
  // Clean up room if empty
  const remaining = await client.hlen(ROOM_KEY(roomId));
  if (remaining === 0) {
    await client.del(ROOM_KEY(roomId));
    await client.del(CHAT_KEY(roomId));
    await client.del(RECORDING_KEY(roomId));
  }
}

/**
 * Get all users in a room.
 */
export async function roomGetUsers(
  roomId: string,
): Promise<Record<string, unknown>[]> {
  const client = getRedisClient();
  const raw = await client.hgetall(ROOM_KEY(roomId));
  return Object.values(raw).map((v) => JSON.parse(v as string));
}

/**
 * Get a specific user in a room.
 */
export async function roomGetUser(
  roomId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const client = getRedisClient();
  const raw = await client.hget(ROOM_KEY(roomId), userId);
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Update a user's data in a room (partial merge).
 */
export async function roomUpdateUser(
  roomId: string,
  userId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const existing = await roomGetUser(roomId, userId);
  if (!existing) return;
  await roomAddUser(roomId, userId, { ...existing, ...updates });
}

/**
 * Get room size (number of participants).
 */
export async function roomSize(roomId: string): Promise<number> {
  const client = getRedisClient();
  return client.hlen(ROOM_KEY(roomId));
}

// ─── Chat History ────────────────────────────────────────────────────

const CHAT_MAX = 500;

/**
 * Push a chat message to room history (capped at 500).
 */
export async function chatPush(
  roomId: string,
  message: Record<string, unknown>,
): Promise<void> {
  const client = getRedisClient();
  await client.rpush(CHAT_KEY(roomId), JSON.stringify(message));
  await client.ltrim(CHAT_KEY(roomId), -CHAT_MAX, -1);
}

/**
 * Get chat history for a room.
 */
export async function chatGetHistory(
  roomId: string,
): Promise<Record<string, unknown>[]> {
  const client = getRedisClient();
  const raw = await client.lrange(CHAT_KEY(roomId), 0, -1);
  return raw.map((v) => JSON.parse(v));
}

// ─── Recording Status ────────────────────────────────────────────────

export async function recordingSet(
  roomId: string,
  status: Record<string, unknown>,
): Promise<void> {
  const client = getRedisClient();
  await client.set(RECORDING_KEY(roomId), JSON.stringify(status));
}

export async function recordingGet(
  roomId: string,
): Promise<Record<string, unknown> | null> {
  const client = getRedisClient();
  const raw = await client.get(RECORDING_KEY(roomId));
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function recordingDel(roomId: string): Promise<void> {
  const client = getRedisClient();
  await client.del(RECORDING_KEY(roomId));
}

// ─── Socket-to-User Mapping ─────────────────────────────────────────

export async function socketMapUser(
  socketId: string,
  mapping: { userId: string; roomId: string },
): Promise<void> {
  const client = getRedisClient();
  await client.hset(SOCKET_KEY(socketId), {
    userId: mapping.userId,
    roomId: mapping.roomId,
  });
}

export async function socketGetMapping(
  socketId: string,
): Promise<{ userId: string; roomId: string } | null> {
  const client = getRedisClient();
  const raw = await client.hgetall(SOCKET_KEY(socketId));
  if (!raw.userId || !raw.roomId) return null;
  return { userId: raw.userId, roomId: raw.roomId };
}

export async function socketRemoveMapping(socketId: string): Promise<void> {
  const client = getRedisClient();
  await client.del(SOCKET_KEY(socketId));
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
    console.error("[Redis] Failed to blacklist token:", err);
  }
}

/**
 * Check if a token has been blacklisted.
 */
export async function tokenIsBlacklisted(token: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    const exists = await client.exists(`token:blacklist:${token}`);
    return exists === 1;
  } catch (err) {
    // If Redis is down, fail closed — treat the token as blacklisted.
    // This prevents a compromised token from being used during a Redis outage.
    console.error("[Redis] Token blacklist check failed, failing closed:", err);
    return true;
  }
}

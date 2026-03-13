import { getRedisClient } from "./client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("redis-cache");
const DEFAULT_TTL = 300; // 5 minutes
const ROOM_TTL = 86400; // 24 hours — crash recovery safety net

/**
 * Get a cached value by key. Returns null if not found or Redis unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, key }, "Cache GET failed");
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
  } catch (err) {
    logger.warn({ err, key }, "Cache SET failed");
  }
}

/**
 * Delete a cached value.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err) {
    logger.warn({ err, key }, "Cache DEL failed");
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
  } catch (err) {
    logger.warn({ err, pattern }, "Cache DEL pattern failed");
  }
}

// ─── Room State Helpers (replaces in-memory Maps) ────────────────────

const ROOM_KEY = (roomId: string) => `room:${roomId}`;
const ROOM_META_KEY = (roomId: string) => `room-meta:${roomId}`;
const WAITING_KEY = (roomId: string) => `waiting:${roomId}`;
const CHAT_KEY = (roomId: string) => `chat:${roomId}`;
const RECORDING_KEY = (roomId: string) => `recording:${roomId}`;
const SOCKET_KEY = (socketId: string) => `socket:${socketId}`;
const ADMISSION_KEY = (roomId: string, userId: string) =>
  `waiting:admitted:${roomId}:${userId}`;

/**
 * Add a user to a room's participant set.
 */
export async function roomAddUser(
  roomId: string,
  userId: string,
  userData: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.hset(ROOM_KEY(roomId), userId, JSON.stringify(userData));
    await client.expire(ROOM_KEY(roomId), ROOM_TTL);
  } catch (err) {
    logger.warn({ err, roomId, userId }, "roomAddUser failed");
  }
}

/**
 * Remove a user from a room.
 */
export async function roomRemoveUser(
  roomId: string,
  userId: string,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.hdel(ROOM_KEY(roomId), userId);
    // Clean up room if empty
    const remaining = await client.hlen(ROOM_KEY(roomId));
    if (remaining === 0) {
      await client.del(ROOM_KEY(roomId));
      await client.del(ROOM_META_KEY(roomId));
      await client.del(WAITING_KEY(roomId));
      await client.del(CHAT_KEY(roomId));
      await client.del(RECORDING_KEY(roomId));
    }
  } catch (err) {
    logger.warn({ err, roomId, userId }, "roomRemoveUser failed");
  }
}

/**
 * Get all users in a room.
 */
export async function roomGetUsers<T extends object = object>(
  roomId: string,
): Promise<T[]> {
  try {
    const client = getRedisClient();
    const raw = await client.hgetall(ROOM_KEY(roomId));
    return Object.values(raw).map((v) => JSON.parse(v as string) as T);
  } catch (err) {
    logger.warn({ err, roomId }, "roomGetUsers failed");
    return [];
  }
}

/**
 * Get a specific user in a room.
 */
export async function roomGetUser<T extends object = object>(
  roomId: string,
  userId: string,
): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.hget(ROOM_KEY(roomId), userId);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, roomId, userId }, "roomGetUser failed");
    return null;
  }
}

/**
 * Atomically update a user's data in a room (partial merge).
 * Uses a Lua script to avoid read-modify-write race conditions.
 */
export async function roomUpdateUser(
  roomId: string,
  userId: string,
  updates: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    const luaScript = [
      "local current = redis.call('HGET', KEYS[1], ARGV[1])",
      "if not current then return 0 end",
      "local obj = cjson.decode(current)",
      "local patch = cjson.decode(ARGV[2])",
      "for k, v in pairs(patch) do obj[k] = v end",
      "redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(obj))",
      "redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))",
      "return 1",
    ].join("\n");

    await client.call(
      "EVAL",
      luaScript,
      1,
      ROOM_KEY(roomId),
      userId,
      JSON.stringify(updates),
      String(ROOM_TTL),
    );
  } catch (err) {
    logger.warn({ err, roomId, userId }, "roomUpdateUser failed");
  }
}

/**
 * Get room size (number of participants).
 */
export async function roomSize(roomId: string): Promise<number> {
  try {
    const client = getRedisClient();
    return client.hlen(ROOM_KEY(roomId));
  } catch (err) {
    logger.warn({ err, roomId }, "roomSize failed");
    return 0;
  }
}

export async function roomSetMeta(
  roomId: string,
  meta: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(ROOM_META_KEY(roomId), JSON.stringify(meta), "EX", ROOM_TTL);
  } catch (err) {
    logger.warn({ err, roomId }, "roomSetMeta failed");
  }
}

export async function roomGetMeta<T extends object>(
  roomId: string,
): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.get(ROOM_META_KEY(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, roomId }, "roomGetMeta failed");
    return null;
  }
}

// ─── Waiting Room State ────────────────────────────────────────────

export async function waitingAddUser(
  roomId: string,
  userId: string,
  userData: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.hset(WAITING_KEY(roomId), userId, JSON.stringify(userData));
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingAddUser failed");
  }
}

export async function waitingGetUsers<T extends object = object>(
  roomId: string,
): Promise<T[]> {
  try {
    const client = getRedisClient();
    const raw = await client.hgetall(WAITING_KEY(roomId));
    return Object.values(raw).map((v) => JSON.parse(v as string) as T);
  } catch (err) {
    logger.warn({ err, roomId }, "waitingGetUsers failed");
    return [];
  }
}

export async function waitingGetUser<T extends object = object>(
  roomId: string,
  userId: string,
): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.hget(WAITING_KEY(roomId), userId);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingGetUser failed");
    return null;
  }
}

export async function waitingRemoveUser(
  roomId: string,
  userId: string,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.hdel(WAITING_KEY(roomId), userId);
  } catch (err) {
    logger.warn({ err, roomId, userId }, "waitingRemoveUser failed");
  }
}

export async function waitingSize(roomId: string): Promise<number> {
  try {
    const client = getRedisClient();
    return client.hlen(WAITING_KEY(roomId));
  } catch (err) {
    logger.warn({ err, roomId }, "waitingSize failed");
    return 0;
  }
}

export async function waitingGrantAdmission(
  roomId: string,
  userId: string,
  ttlSeconds = 300,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(ADMISSION_KEY(roomId, userId), "1", "EX", ttlSeconds);
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

// ─── Chat History ────────────────────────────────────────────────────

const CHAT_MAX = 500;

/**
 * Push a chat message to room history (capped at 500).
 */
export async function chatPush(
  roomId: string,
  message: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.rpush(CHAT_KEY(roomId), JSON.stringify(message));
    await client.ltrim(CHAT_KEY(roomId), -CHAT_MAX, -1);
  } catch (err) {
    logger.warn({ err, roomId }, "chatPush failed");
  }
}

/**
 * Get chat history for a room.
 */
export async function chatGetHistory<T extends object = object>(
  roomId: string,
): Promise<T[]> {
  try {
    const client = getRedisClient();
    const raw = await client.lrange(CHAT_KEY(roomId), 0, -1);
    return raw.map((v) => JSON.parse(v) as T);
  } catch (err) {
    logger.warn({ err, roomId }, "chatGetHistory failed");
    return [];
  }
}

// ─── Recording Status ────────────────────────────────────────────────

export async function recordingSet(
  roomId: string,
  status: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.set(RECORDING_KEY(roomId), JSON.stringify(status));
  } catch (err) {
    logger.warn({ err, roomId }, "recordingSet failed");
  }
}

export async function recordingGet<T extends object = object>(
  roomId: string,
): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.get(RECORDING_KEY(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, roomId }, "recordingGet failed");
    return null;
  }
}

export async function recordingDel(roomId: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(RECORDING_KEY(roomId));
  } catch (err) {
    logger.warn({ err, roomId }, "recordingDel failed");
  }
}

// ─── Socket-to-User Mapping ─────────────────────────────────────────

export async function socketMapUser(
  socketId: string,
  mapping: { userId: string; roomId: string; state?: "joined" | "waiting" },
): Promise<void> {
  try {
    const client = getRedisClient();
    await client.hset(SOCKET_KEY(socketId), {
      userId: mapping.userId,
      roomId: mapping.roomId,
      state: mapping.state || "joined",
    });
  } catch (err) {
    logger.warn({ err, socketId }, "socketMapUser failed");
  }
}

export async function socketGetMapping(
  socketId: string,
): Promise<
  { userId: string; roomId: string; state: "joined" | "waiting" } | null
> {
  try {
    const client = getRedisClient();
    const raw = await client.hgetall(SOCKET_KEY(socketId));
    if (!raw.userId || !raw.roomId) return null;
    return {
      userId: raw.userId,
      roomId: raw.roomId,
      state: raw.state === "waiting" ? "waiting" : "joined",
    };
  } catch (err) {
    logger.warn({ err, socketId }, "socketGetMapping failed");
    return null;
  }
}

export async function socketRemoveMapping(socketId: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(SOCKET_KEY(socketId));
  } catch (err) {
    logger.warn({ err, socketId }, "socketRemoveMapping failed");
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

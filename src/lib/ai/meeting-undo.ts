import { nanoid } from "nanoid";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meeting-undo");

const TTL_SECONDS = 86400; // 24 hours

export interface UndoPayload {
  action: string;
  resourceId: string;
  reverseAction: string;
  reverseArgs: Record<string, unknown>;
  description?: string;
}

export interface StoredUndo extends UndoPayload {
  userId: string;
  createdAt: string;
}

/**
 * Safely parse JSON, returning null on failure.
 */
function safeParse(raw: string): StoredUndo | null {
  try {
    return JSON.parse(raw) as StoredUndo;
  } catch (err) {
    log.error({ err }, "Failed to parse undo token JSON");
    return null;
  }
}

/**
 * Store an undo token in Redis with 24h TTL.
 * Returns the generated token key.
 */
export async function storeUndoToken(
  userId: string,
  payload: UndoPayload
): Promise<string> {
  const token = `undo:${nanoid(16)}`;
  const stored: StoredUndo = {
    ...payload,
    userId,
    createdAt: new Date().toISOString(),
  };

  const redis = getRedisClient();
  await redis.set(token, JSON.stringify(stored), "EX", TTL_SECONDS);

  log.info({ token, userId, action: payload.action }, "Undo token stored");
  return token;
}

/**
 * Get an undo token without consuming it.
 * Returns null if the token does not exist, has expired, or is corrupted.
 */
export async function getUndoToken(token: string): Promise<StoredUndo | null> {
  const redis = getRedisClient();
  const raw = await redis.get(token);
  if (!raw) return null;
  return safeParse(raw);
}

/**
 * Atomically get and delete an undo token (one-time use).
 * Uses GETDEL to prevent race conditions where two concurrent calls
 * could both read and act on the same token.
 * Returns null if the token does not exist, has expired, or is corrupted.
 */
export async function consumeUndoToken(
  token: string
): Promise<StoredUndo | null> {
  const redis = getRedisClient();

  // GETDEL atomically gets the value and deletes the key in one operation,
  // preventing double-consume race conditions.
  // Fallback to GET+DEL for Redis < 6.2
  let raw: string | null;
  try {
    raw = await (redis as unknown as { getdel(key: string): Promise<string | null> }).getdel(token);
  } catch {
    // GETDEL not supported — fall back to GET + DEL (best-effort atomicity)
    raw = await redis.get(token);
    if (raw) await redis.del(token);
  }

  if (!raw) return null;

  log.info({ token }, "Undo token consumed");
  return safeParse(raw);
}

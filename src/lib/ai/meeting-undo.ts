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
 * Returns null if the token does not exist or has expired.
 */
export async function getUndoToken(token: string): Promise<StoredUndo | null> {
  const redis = getRedisClient();
  const raw = await redis.get(token);
  if (!raw) return null;
  return JSON.parse(raw) as StoredUndo;
}

/**
 * Get and delete an undo token (one-time use).
 * Returns null if the token does not exist or has expired.
 */
export async function consumeUndoToken(
  token: string
): Promise<StoredUndo | null> {
  const redis = getRedisClient();
  const raw = await redis.get(token);
  if (!raw) return null;

  await redis.del(token);
  log.info({ token }, "Undo token consumed");
  return JSON.parse(raw) as StoredUndo;
}

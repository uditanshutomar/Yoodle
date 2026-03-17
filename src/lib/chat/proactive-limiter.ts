import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("proactive-limiter");

const GLOBAL_CAP = 3;
const TTL_SECONDS = 86400; // 24 hours

export type ProactiveType =
  | "deadline_reminder"
  | "follow_up_nudge"
  | "meeting_prep"
  | "blocked_task_alert"
  | "weekly_digest"
  | "task_status";

/**
 * Atomically check whether a proactive message of the given type is allowed.
 * If allowed, increments counters and returns true.
 * If rate-limited, returns false.
 *
 * Uses a Lua script so the check-and-increment is a single atomic operation,
 * preventing race conditions where two concurrent calls both pass the check
 * before either increments.
 */
export async function canSendProactive(
  conversationId: string,
  agentUserId: string,
  type: ProactiveType
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const globalKey = `proactive:${conversationId}:${agentUserId}:global`;
    const typeKey = `proactive:${conversationId}:${agentUserId}:${type}`;

    // Atomic Lua: check type cap + global cap, only increment if both pass.
    // Returns 1 if allowed (and incremented), 0 if rate-limited.
    // Note: redis.eval() here is ioredis's API for server-side Lua — not JS eval().
    const luaScript = `
      if redis.call("EXISTS", KEYS[2]) == 1 then return 0 end
      local g = tonumber(redis.call("GET", KEYS[1]) or "0")
      if g >= tonumber(ARGV[1]) then return 0 end
      redis.call("INCR", KEYS[1])
      redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
      redis.call("SET", KEYS[2], "1", "EX", tonumber(ARGV[2]))
      return 1
    `;

    // ioredis eval(): runs Lua on Redis server (not JS eval)
    const result = await redis.eval(luaScript, 2, globalKey, typeKey, GLOBAL_CAP, TTL_SECONDS);
    const allowed = result === 1;

    if (!allowed) {
      log.info({ conversationId, agentUserId, type }, "Proactive message rate-limited");
    }

    return allowed;
  } catch (err) {
    log.warn({ err, conversationId, agentUserId, type }, "Rate limiter error - allowing message");
    return true; // Fail open
  }
}

/**
 * Check if user has muted proactive messages for this conversation.
 * Returns true if muted (should NOT send).
 */
export async function isAgentMuted(
  conversationId: string,
  agentUserId: string
): Promise<boolean> {
  try {
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const conv = await Conversation.findOne(
      {
        _id: conversationId,
        "participants.userId": agentUserId,
      },
      { "participants.$": 1 }
    ).lean();

    if (!conv?.participants?.[0]) return false;
    const participant = conv.participants[0];
    if (!participant.agentMutedUntil) return false;
    return new Date(participant.agentMutedUntil) > new Date();
  } catch {
    return false; // Fail open
  }
}

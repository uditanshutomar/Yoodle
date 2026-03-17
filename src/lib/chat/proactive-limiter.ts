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
 * Check whether a proactive message of the given type is allowed.
 * If allowed, increments counters and returns true.
 * If rate-limited, returns false.
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

    // Check type cap first (cheaper)
    const typeUsed = await redis.exists(typeKey);
    if (typeUsed) {
      log.info({ conversationId, agentUserId, type }, "Proactive message rate-limited (type cap)");
      return false;
    }

    // Check global cap
    const globalCount = await redis.get(globalKey);
    if (globalCount && parseInt(globalCount, 10) >= GLOBAL_CAP) {
      log.info({ conversationId, agentUserId, type }, "Proactive message rate-limited (global cap)");
      return false;
    }

    // Increment global counter and set type flag atomically via pipeline
    const pipe = redis.pipeline();
    pipe.incr(globalKey);
    pipe.expire(globalKey, TTL_SECONDS);
    pipe.set(typeKey, "1", "EX", TTL_SECONDS);
    await pipe.exec();

    return true;
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

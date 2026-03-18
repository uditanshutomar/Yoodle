import mongoose from "mongoose";
import connectDB from "@/lib/infra/db/client";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import { canSendProactive, isAgentMuted } from "@/lib/chat/proactive-limiter";
import { toClientMessage } from "@/lib/chat/message-transform";

const log = createLogger("task-notifications");

/**
 * Post a task status change notification to linked conversations.
 * Call this from task update endpoints when status changes.
 */
export async function notifyTaskStatusChange(
  taskId: string,
  newStatus: "completed" | "updated" | "overdue",
  actorUserId: string,
  actorName: string,
  taskTitle: string
): Promise<void> {
  try {
    await connectDB();
    const ConversationContext = (await import("@/lib/infra/db/models/conversation-context")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const contexts = await ConversationContext.find({
      linkedTaskIds: new mongoose.Types.ObjectId(taskId),
    }).select("conversationId").lean();

    if (contexts.length === 0) return;

    const statusMessages: Record<string, string> = {
      completed: `Task "${taskTitle}" marked complete by ${actorName}`,
      updated: `Task "${taskTitle}" updated by ${actorName}`,
      overdue: `Task "${taskTitle}" is now overdue`,
    };
    const content = statusMessages[newStatus] || `Task "${taskTitle}" status changed`;

    for (const ctx of contexts) {
      const convId = ctx.conversationId.toString();
      try {
        if (await isAgentMuted(convId, actorUserId)) continue;
        if (!(await canSendProactive(convId, actorUserId, "task_status"))) continue;

        const msg = await DirectMessage.create({
          conversationId: ctx.conversationId,
          senderId: new mongoose.Types.ObjectId(actorUserId),
          senderType: "agent",
          content,
          type: "system",
          agentMeta: { forUserId: new mongoose.Types.ObjectId(actorUserId) },
        });

        // Populate for consistent client message shape
        const populated = await DirectMessage.findById(msg._id)
          .populate("senderId", "name displayName avatarUrl status")
          .lean();

        await Conversation.updateOne(
          { _id: ctx.conversationId },
          {
            $set: {
              lastMessageAt: msg.createdAt,
              lastMessagePreview: content.slice(0, 100),
              lastMessageSenderId: msg.senderId,
            },
          },
        );

        try {
          const redis = getRedisClient();
          await redis.publish(`chat:${convId}`, JSON.stringify({ type: "message", data: toClientMessage(populated || msg) }));
        } catch (err) {
          log.warn({ err, convId, taskId }, "Redis publish failed for task notification (message saved to DB)");
        }
      } catch (err) {
        log.warn({ err, convId, taskId }, "failed to post task status notification");
      }
    }
  } catch (err) {
    log.warn({ err, taskId }, "failed to notify task status change");
  }
}

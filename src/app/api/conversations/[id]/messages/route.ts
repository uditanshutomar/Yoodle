import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { getRedisClient } from "@/lib/infra/redis/client";
import { invalidateCache } from "@/lib/infra/redis/cache";
import { toClientMessage } from "@/lib/chat/message-transform";
import { publishNotification } from "@/lib/notifications/publish";
import User from "@/lib/infra/db/models/user";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:conversations:messages");

const createMessageSchema = z.object({
  content: z.string().min(1, "Message content is required.").max(4000, "Message content must be 4000 characters or less."),
  replyTo: z.string().refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    { message: "Invalid replyTo message ID." },
  ).optional(),
});

const URGENCY_PATTERNS = /\b(asap|urgent|blocking|blocked|critical|deadline today|deadline tomorrow|p0|p1|emergency|immediately)\b/i;

function detectPriority(content: string): "high" | "normal" {
  return URGENCY_PATTERNS.test(content) ? "high" : "normal";
}

// -- GET /api/conversations/[id]/messages ------------------------------------

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  await connectDB();

  // Verify user is a participant (atomic single query — no TOCTOU gap)
  const conversation = await Conversation.findOne({
    _id: new mongoose.Types.ObjectId(id),
    "participants.userId": new mongoose.Types.ObjectId(userId),
  })
    .select("participants")
    .lean();
  if (!conversation) {
    throw new NotFoundError("Conversation not found.");
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const before = searchParams.get("before");
  const limitParam = searchParams.get("limit");
  let limit = limitParam ? parseInt(limitParam, 10) : 30;
  if (isNaN(limit) || limit < 1) limit = 30;
  if (limit > 50) limit = 50;

  // Build query
  const query: Record<string, unknown> = {
    conversationId: new mongoose.Types.ObjectId(id),
  };
  if (before) {
    if (!mongoose.Types.ObjectId.isValid(before)) {
      throw new BadRequestError("Invalid cursor value.");
    }
    query._id = { $lt: new mongoose.Types.ObjectId(before) };
  }

  const messages = await DirectMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", "name displayName avatarUrl status")
    .populate({
      path: "replyTo",
      select: "content senderId createdAt",
      populate: { path: "senderId", select: "name" },
    })
    .lean();

  return successResponse({ messages: messages.map(toClientMessage) });
});

// -- POST /api/conversations/[id]/messages -----------------------------------

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  await connectDB();

  // Verify user is a participant (atomic single query — no TOCTOU gap)
  const conversation = await Conversation.findOne({
    _id: new mongoose.Types.ObjectId(id),
    "participants.userId": new mongoose.Types.ObjectId(userId),
  })
    .select("participants meetingId")
    .lean();
  if (!conversation) {
    throw new NotFoundError("Conversation not found.");
  }

  // Validate body
  const { content, replyTo } = createMessageSchema.parse(await req.json());

  // Validate replyTo belongs to this conversation
  if (replyTo) {
    const replyMsg = await DirectMessage.exists({
      _id: new mongoose.Types.ObjectId(replyTo),
      conversationId: new mongoose.Types.ObjectId(id),
    });
    if (!replyMsg) {
      throw new BadRequestError("Replied message not found in this conversation.");
    }
  }

  // Check if this conversation has an active meeting
    let isActiveMeeting = false;
    if (conversation.meetingId) {
      const MeetingModel = (await import("@/lib/infra/db/models/meeting")).default;
      const meeting = await MeetingModel.findById(conversation.meetingId).select("status").lean();
      isActiveMeeting = meeting?.status === "live";
    }

    const priority = detectPriority(content);

  // Create message
  const message = await DirectMessage.create({
    conversationId: new mongoose.Types.ObjectId(id),
    senderId: new mongoose.Types.ObjectId(userId),
    senderType: "user",
    type: "text",
    content: content.trim(),
    priority,
    ...(replyTo ? { replyTo: new mongoose.Types.ObjectId(replyTo) } : {}),
    ...(isActiveMeeting ? { meetingContext: true } : {}),
  });

  // Update conversation metadata (non-fatal — message is already persisted)
  // Use $max to prevent lastMessageAt from regressing under concurrent writes
  try {
    await Conversation.findByIdAndUpdate(id, {
      $max: { lastMessageAt: message.createdAt },
      $set: {
        lastMessagePreview: content.trim().slice(0, 100),
        lastMessageSenderId: new mongoose.Types.ObjectId(userId),
      },
    });
  } catch (err) {
    log.warn({ err, conversationId: id }, "Failed to update conversation metadata after message creation");
  }

  // Populate for response and Redis publish
  const populated = await DirectMessage.findById(message._id)
    .populate("senderId", "name displayName avatarUrl status")
    .populate({
      path: "replyTo",
      select: "content senderId createdAt",
      populate: { path: "senderId", select: "name" },
    })
    .lean();

  if (!populated) {
    log.warn({ messageId: message._id, conversationId: id }, "Failed to re-fetch message after creation");
    return successResponse({ _id: message._id.toString(), content: content.trim(), createdAt: message.createdAt }, 201);
  }

  const clientMessage = toClientMessage(populated);

  // Invalidate conversations list and unread count caches for all participants
  // so their next poll picks up the new message. Non-fatal if Redis is down.
  try {
    const invalidations = conversation.participants.map((p: { userId: mongoose.Types.ObjectId }) => {
      const pid = p.userId.toString();
      return Promise.all([
        invalidateCache(`user:conversations:${pid}`),
        invalidateCache(`user:unread:${pid}`),
      ]);
    });
    await Promise.all(invalidations);
  } catch (err) {
    log.warn({ err, conversationId: id }, "Failed to invalidate conversation caches after message");
  }

  // Publish to Redis for real-time delivery (non-fatal if Redis is down)
  try {
    const redis = getRedisClient();
    await redis.publish(
      `chat:${id}`,
      JSON.stringify({ type: "message", data: clientMessage })
    );
  } catch (err) {
    log.warn({ err, conversationId: id }, "Failed to publish message to Redis");
  }

  // Detect @mentions and send notifications (non-blocking)
  const mentionRegex = /@(\w+)/g;
  const mentions = [...(content || "").matchAll(mentionRegex)];
  if (mentions.length > 0) {
    Promise.resolve().then(async () => {
      try {
        const mentionNames = mentions.map((m) => m[1]);
        const mentionedUsers = await User.find({
          $or: mentionNames.flatMap((n) => [
            { name: { $regex: new RegExp(`^${n}$`, "i") } },
            { displayName: { $regex: new RegExp(`^${n}$`, "i") } },
          ]),
        }).select("_id name").lean();

        for (const mentioned of mentionedUsers) {
          if (mentioned._id.toString() !== userId) {
            await publishNotification({
              userId: mentioned._id.toString(),
              type: "mention",
              title: "You were mentioned in a message",
              body: (content || "").slice(0, 120),
              sourceType: "message",
              sourceId: id,
              priority: "urgent",
            });
          }
        }
      } catch {
        // Non-critical — notification failure shouldn't break message send
      }
    });
  }

  // Fire-and-forget: trigger agent responses (including the sender's own agent)
  const mentionsDoodle = content.toLowerCase().includes("@doodle");
  if (mentionsDoodle || conversation.participants.some((p: { agentEnabled?: boolean }) => p.agentEnabled)) {
    import("@/lib/chat/agent-processor").then(({ processAgentResponses }) => {
      processAgentResponses(id, { senderId: userId, content, senderType: "user" }).catch((err) => {
        log.error({ err, conversationId: id }, "Agent processing failed");
      });
    }).catch((err) => {
      log.error({ err, conversationId: id }, "Failed to import agent-processor module");
    });
  }

  return successResponse(clientMessage, 201);
});

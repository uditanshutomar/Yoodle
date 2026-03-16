import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { getRedisClient } from "@/lib/infra/redis/client";
import { toClientMessage } from "@/lib/chat/message-transform";

// -- GET /api/conversations/[id]/messages ------------------------------------

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  await connectDB();

  // Verify user is a participant
  const conversation = await Conversation.findById(id).lean();
  if (!conversation) {
    throw new NotFoundError("Conversation not found.");
  }

  const isParticipant = conversation.participants.some(
    (p) => p.userId.toString() === userId
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this conversation.");
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

  await connectDB();

  // Verify user is a participant
  const conversation = await Conversation.findById(id).lean();
  if (!conversation) {
    throw new NotFoundError("Conversation not found.");
  }

  const isParticipant = conversation.participants.some(
    (p) => p.userId.toString() === userId
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this conversation.");
  }

  // Validate body
  const body = await req.json();
  const { content, replyTo } = body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    throw new BadRequestError("Message content is required.");
  }
  if (content.length > 4000) {
    throw new BadRequestError("Message content must be 4000 characters or less.");
  }

  // Create message
  const message = await DirectMessage.create({
    conversationId: new mongoose.Types.ObjectId(id),
    senderId: new mongoose.Types.ObjectId(userId),
    senderType: "user",
    type: "text",
    content: content.trim(),
    ...(replyTo ? { replyTo: new mongoose.Types.ObjectId(replyTo) } : {}),
  });

  // Update conversation metadata
  await Conversation.findByIdAndUpdate(id, {
    lastMessageAt: message.createdAt,
    lastMessagePreview: content.trim().slice(0, 100),
    lastMessageSenderId: new mongoose.Types.ObjectId(userId),
  });

  // Populate for response and Redis publish
  const populated = await DirectMessage.findById(message._id)
    .populate("senderId", "name displayName avatarUrl status")
    .populate({
      path: "replyTo",
      select: "content senderId createdAt",
      populate: { path: "senderId", select: "name" },
    })
    .lean();

  const clientMessage = toClientMessage(populated);

  // Publish to Redis for real-time delivery
  const redis = getRedisClient();
  await redis.publish(
    `chat:${id}`,
    JSON.stringify({ type: "message", data: clientMessage })
  );

  // Fire-and-forget: trigger agent responses (including the sender's own agent)
  const mentionsDoodle = content.toLowerCase().includes("@doodle");
  if (mentionsDoodle || conversation.participants.some((p: { agentEnabled?: boolean }) => p.agentEnabled)) {
    import("@/lib/chat/agent-processor").then(({ processAgentResponses }) => {
      processAgentResponses(id, { senderId: userId, content }).catch(() => {});
    });
  }

  return successResponse(clientMessage);
});

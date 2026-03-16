import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { getRedisClient } from "@/lib/infra/redis/client";

// -- POST /api/conversations/[id]/reactions -----------------------------------

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

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
  const { messageId, emoji } = body;

  if (!messageId || typeof messageId !== "string") {
    throw new BadRequestError("messageId is required.");
  }
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new BadRequestError("Invalid message ID.");
  }
  if (!emoji || typeof emoji !== "string") {
    throw new BadRequestError("emoji is required.");
  }
  // Prevent storing arbitrary-length strings as "emoji" reactions
  if (emoji.length > 32) {
    throw new BadRequestError("Emoji value is too long.");
  }

  // Find the message and verify it belongs to this conversation
  const message = await DirectMessage.findById(messageId);
  if (!message) {
    throw new NotFoundError("Message not found.");
  }
  if (message.conversationId.toString() !== id) {
    throw new ForbiddenError("Message does not belong to this conversation.");
  }

  // Atomic toggle: try to remove first. If nothing was removed, add.
  // This avoids the TOCTOU race where two concurrent requests both read
  // "no existing reaction" and both push a duplicate.
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const pullResult = await DirectMessage.findOneAndUpdate(
    {
      _id: messageId,
      reactions: { $elemMatch: { emoji, userId: userObjectId } },
    },
    { $pull: { reactions: { emoji, userId: userObjectId } } },
    { new: true }
  ).lean();

  let updatedMessage;
  let action: "add" | "remove";

  if (pullResult) {
    // Reaction existed and was removed
    updatedMessage = pullResult;
    action = "remove";
  } else {
    // Reaction didn't exist — add it. Use $addToSet-like guard by
    // conditioning on "no matching reaction" to prevent duplicates.
    const pushResult = await DirectMessage.findOneAndUpdate(
      {
        _id: messageId,
        reactions: { $not: { $elemMatch: { emoji, userId: userObjectId } } },
      },
      {
        $push: {
          reactions: { emoji, userId: userObjectId, createdAt: new Date() },
        },
      },
      { new: true }
    ).lean();
    updatedMessage = pushResult || message;
    action = "add";
  }

  // Publish to Redis (non-fatal if Redis is down)
  try {
    const redis = getRedisClient();
    await redis.publish(
      `chat:${id}`,
      JSON.stringify({ type: "reaction", messageId, emoji, userId, action })
    );
  } catch {
    // Reaction is persisted in DB; real-time delivery is best-effort
  }

  return successResponse(updatedMessage);
});

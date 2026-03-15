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
  if (!emoji || typeof emoji !== "string") {
    throw new BadRequestError("emoji is required.");
  }

  // Find the message and verify it belongs to this conversation
  const message = await DirectMessage.findById(messageId);
  if (!message) {
    throw new NotFoundError("Message not found.");
  }
  if (message.conversationId.toString() !== id) {
    throw new ForbiddenError("Message does not belong to this conversation.");
  }

  // Toggle reaction: check if user already has this emoji
  const existingReaction = message.reactions.find(
    (r) => r.emoji === emoji && r.userId.toString() === userId
  );

  let updatedMessage;
  if (existingReaction) {
    // Remove the reaction
    updatedMessage = await DirectMessage.findByIdAndUpdate(
      messageId,
      {
        $pull: {
          reactions: {
            emoji,
            userId: new mongoose.Types.ObjectId(userId),
          },
        },
      },
      { new: true }
    ).lean();
  } else {
    // Add the reaction
    updatedMessage = await DirectMessage.findByIdAndUpdate(
      messageId,
      {
        $push: {
          reactions: {
            emoji,
            userId: new mongoose.Types.ObjectId(userId),
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).lean();
  }

  // Publish to Redis — format matches client expectation
  const redis = getRedisClient();
  await redis.publish(
    `chat:${id}`,
    JSON.stringify({
      type: "reaction",
      messageId,
      emoji,
      userId,
      action: existingReaction ? "remove" : "add",
    })
  );

  return successResponse(updatedMessage);
});

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

// -- POST /api/conversations/[id]/pin -----------------------------------------

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
  const { messageId } = body;

  if (!messageId || typeof messageId !== "string") {
    throw new BadRequestError("messageId is required.");
  }

  // Verify the message belongs to this conversation
  const message = await DirectMessage.findById(messageId).lean();
  if (!message) {
    throw new NotFoundError("Message not found.");
  }
  if (message.conversationId.toString() !== id) {
    throw new ForbiddenError("Message does not belong to this conversation.");
  }

  // Toggle pin
  const messageObjectId = new mongoose.Types.ObjectId(messageId);
  const isPinned = conversation.pinnedMessageIds.some(
    (pid) => pid.toString() === messageId
  );

  if (isPinned) {
    // Unpin
    await Conversation.updateOne(
      { _id: id },
      { $pull: { pinnedMessageIds: messageObjectId } }
    );
  } else {
    // Check max 25 pins
    if (conversation.pinnedMessageIds.length >= 25) {
      throw new BadRequestError(
        "Maximum of 25 pinned messages per conversation."
      );
    }
    // Pin
    await Conversation.updateOne(
      { _id: id },
      { $push: { pinnedMessageIds: messageObjectId } }
    );
  }

  // Fetch updated conversation for response
  const updated = await Conversation.findById(id)
    .select("pinnedMessageIds")
    .lean();

  return successResponse({
    pinnedMessageIds: updated!.pinnedMessageIds,
  });
});

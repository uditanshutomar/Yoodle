import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
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

const pinSchema = z.object({
  messageId: z.string().min(1, "messageId is required"),
});

// -- POST /api/conversations/[id]/pin -----------------------------------------

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  await connectDB();

  // Verify user is a participant
  const conversation = await Conversation.findById(id)
    .select("participants pinnedMessageIds")
    .lean();
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
  const { messageId } = pinSchema.parse(await req.json());
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new BadRequestError("Invalid message ID.");
  }

  // Verify the message belongs to this conversation
  const message = await DirectMessage.findById(messageId).lean();
  if (!message) {
    throw new NotFoundError("Message not found.");
  }
  if (message.conversationId.toString() !== id) {
    throw new ForbiddenError("Message does not belong to this conversation.");
  }

  // Toggle pin atomically to prevent race conditions
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
    // Atomic pin with capacity guard — prevents concurrent requests
    // from both passing a stale "length < 25" check
    const pinResult = await Conversation.updateOne(
      {
        _id: id,
        pinnedMessageIds: { $ne: messageObjectId },
        $expr: { $lt: [{ $size: "$pinnedMessageIds" }, 25] },
      },
      { $push: { pinnedMessageIds: messageObjectId } }
    );

    if (pinResult.modifiedCount === 0) {
      // Either already pinned (concurrent request) or at capacity
      const fresh = await Conversation.findById(id).select("pinnedMessageIds").lean();
      if (fresh && fresh.pinnedMessageIds.length >= 25) {
        throw new BadRequestError(
          "Maximum of 25 pinned messages per conversation."
        );
      }
      // Otherwise: already pinned by a concurrent request — no-op is fine
    }
  }

  // Fetch updated conversation for response
  const updated = await Conversation.findById(id)
    .select("pinnedMessageIds")
    .lean();

  return successResponse({
    pinnedMessageIds: updated!.pinnedMessageIds,
  });
});

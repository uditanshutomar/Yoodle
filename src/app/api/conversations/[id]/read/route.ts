import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { ForbiddenError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import { getRedisClient } from "@/lib/infra/redis/client";

// -- POST /api/conversations/[id]/read ----------------------------------------

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

  // Mark as read
  const readAt = new Date();
  await Conversation.updateOne(
    { _id: id, "participants.userId": new mongoose.Types.ObjectId(userId) },
    { $set: { "participants.$.lastReadAt": readAt } }
  );

  // Publish to Redis
  const redis = getRedisClient();
  await redis.publish(
    `chat:${id}`,
    JSON.stringify({ type: "read", userId, readAt: readAt.toISOString() })
  );

  return successResponse({ success: true });
});

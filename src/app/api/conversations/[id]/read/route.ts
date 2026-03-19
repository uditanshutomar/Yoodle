import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:conversations:read");

// -- POST /api/conversations/[id]/read ----------------------------------------

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  await connectDB();

  // Atomic: verify participant + mark as read in a single operation
  const readAt = new Date();
  const result = await Conversation.updateOne(
    {
      _id: new mongoose.Types.ObjectId(id),
      "participants.userId": new mongoose.Types.ObjectId(userId),
    },
    { $set: { "participants.$.lastReadAt": readAt } }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError("Conversation not found.");
  }

  // Publish to Redis (non-fatal if Redis is down)
  try {
    const redis = getRedisClient();
    await redis.publish(
      `chat:${id}`,
      JSON.stringify({ type: "read", userId, readAt: readAt.toISOString() })
    );
  } catch (err) {
    log.warn({ err, conversationId: id }, "Failed to publish read receipt to Redis");
  }

  return successResponse({ readAt: readAt.toISOString() });
});

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import User from "@/lib/infra/db/models/user";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:conversations:typing");

// -- POST /api/conversations/[id]/typing --------------------------------------

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  await connectDB();

  // Verify user is a participant (atomic single query)
  const conversation = await Conversation.findOne({
    _id: new mongoose.Types.ObjectId(id),
    "participants.userId": new mongoose.Types.ObjectId(userId),
  })
    .select("_id")
    .lean();
  if (!conversation) {
    throw new NotFoundError("Conversation not found.");
  }

  // Look up user's displayName
  const user = await User.findById(userId).select("displayName").lean();
  if (!user) {
    throw new NotFoundError("User not found.");
  }

  // Publish typing indicator to Redis (non-fatal if Redis is down)
  try {
    const redis = getRedisClient();
    await redis.publish(
      `chat:${id}`,
      JSON.stringify({ type: "typing", userId, name: user.displayName })
    );
  } catch (err) {
    log.warn({ err, conversationId: id }, "Failed to publish typing indicator to Redis");
  }

  return successResponse({ ok: true });
});

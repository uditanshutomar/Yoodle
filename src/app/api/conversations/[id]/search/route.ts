import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import {
  BadRequestError,
  NotFoundError,
} from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { toClientMessage } from "@/lib/chat/message-transform";

// -- GET /api/conversations/[id]/search?q=searchterm -------------------------

export const GET = withHandler(async (req: NextRequest, context) => {
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

  // Parse search query
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length === 0) {
    throw new BadRequestError("Search query (q) is required.");
  }
  if (q.length > 200) {
    throw new BadRequestError("Search query must be 200 characters or fewer.");
  }

  // Escape special regex characters to prevent injection
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const messages = await DirectMessage.find({
    conversationId: new mongoose.Types.ObjectId(id),
    content: { $regex: escaped, $options: "i" },
    deleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("senderId", "name displayName avatarUrl")
    .lean();

  return successResponse({ messages: messages.map(toClientMessage), total: messages.length });
});

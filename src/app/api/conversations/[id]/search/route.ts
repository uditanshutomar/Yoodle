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
import { toClientMessage } from "@/lib/chat/message-transform";

// -- GET /api/conversations/[id]/search?q=searchterm -------------------------

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

  // Parse search query
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    throw new BadRequestError("Search query (q) is required.");
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

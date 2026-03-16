import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";

// ─── GET /api/conversations/unread-count ──────────────────────────────
// Lightweight endpoint that returns only the total unread message count.
// Used by the sidebar badge to avoid fetching + populating all conversations.

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Only select the fields needed: participants (for lastReadAt) and _id.
  // Cap at 500 to prevent unbounded memory use for power users.
  const conversations = await Conversation.find(
    { "participants.userId": userOid },
    { _id: 1, participants: 1 },
  )
    .sort({ lastMessageAt: -1 })
    .limit(500)
    .lean();

  if (conversations.length === 0) {
    return successResponse({ totalUnread: 0 });
  }

  // Count unread messages across all conversations in parallel
  const counts = await Promise.all(
    conversations.map((conv) => {
      const me = conv.participants.find(
        (p) => p.userId.toString() === userId,
      );
      const lastReadAt = me?.lastReadAt ?? new Date(0);
      return DirectMessage.countDocuments({
        conversationId: conv._id,
        createdAt: { $gt: lastReadAt },
        senderId: { $ne: userOid },
      });
    }),
  );

  const totalUnread = counts.reduce((sum, c) => sum + c, 0);
  return successResponse({ totalUnread });
});

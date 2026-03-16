import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import User from "@/lib/infra/db/models/user";

// ─── GET /api/conversations/[id] ─────────────────────────────────────

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const conv = await Conversation.findOne({
    _id: new mongoose.Types.ObjectId(id),
    "participants.userId": userOid,
  }).lean();

  if (!conv) throw new NotFoundError("Conversation not found.");

  // Populate participant details
  const participantIds = conv.participants.map((p) => p.userId);
  const users = await User.find({ _id: { $in: participantIds } })
    .select("name displayName avatarUrl status")
    .lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  // Compute unread count
  const me = conv.participants.find(
    (p) => p.userId.toString() === userId,
  );
  const lastReadAt = me?.lastReadAt ?? new Date(0);
  const unreadCount = await DirectMessage.countDocuments({
    conversationId: conv._id,
    createdAt: { $gt: lastReadAt },
    senderId: { $ne: userOid },
  });

  return successResponse({
    _id: conv._id.toString(),
    type: conv.type,
    name: conv.name,
    unreadCount,
    lastMessage: conv.lastMessagePreview
      ? {
          content: conv.lastMessagePreview,
          sender: conv.lastMessageSenderId?.toString() ?? "",
          createdAt:
            conv.lastMessageAt?.toISOString() ??
            conv.updatedAt?.toISOString(),
        }
      : undefined,
    participants: conv.participants.map((p) => {
      const u = userMap.get(p.userId.toString());
      return {
        _id: p.userId.toString(),
        name: u?.name ?? "Unknown",
        displayName: u?.displayName,
        avatar: u?.avatarUrl,
      };
    }),
    createdAt: conv.createdAt?.toISOString(),
    updatedAt: conv.updatedAt?.toISOString(),
  });
});

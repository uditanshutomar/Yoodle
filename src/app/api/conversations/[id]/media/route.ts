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

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;

// GET /api/conversations/[id]/media?type=links|images
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  await connectDB();

  const conversation = await Conversation.findById(id).lean();
  if (!conversation) throw new NotFoundError("Conversation not found.");

  const isParticipant = conversation.participants.some(
    (p) => p.userId.toString() === userId
  );
  if (!isParticipant) throw new ForbiddenError("Not a participant.");

  const { searchParams } = new URL(req.url);
  const mediaType = searchParams.get("type") || "links";

  if (!["links", "images"].includes(mediaType)) {
    throw new BadRequestError("type must be 'links' or 'images'.");
  }

  // Fetch all non-deleted messages that likely contain URLs
  const messages = await DirectMessage.find({
    conversationId: new mongoose.Types.ObjectId(id),
    content: { $regex: "https?://", $options: "i" },
    deleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("senderId", "name displayName avatarUrl")
    .lean();

  // Extract URLs from messages
  const items: Array<{
    url: string;
    messageId: string;
    sender: { name: string; avatarUrl?: string };
    sharedAt: string;
  }> = [];

  for (const msg of messages) {
    const urls = (msg.content || "").match(URL_REGEX) || [];
    for (const url of urls) {
      const isImage = IMAGE_EXTENSIONS.test(url);
      if (mediaType === "images" && !isImage) continue;
      if (mediaType === "links" && isImage) continue;

      const sender = msg.senderId as any;
      items.push({
        url,
        messageId: (msg._id as mongoose.Types.ObjectId).toString(),
        sender: {
          name: sender?.displayName || sender?.name || "Unknown",
          avatarUrl: sender?.avatarUrl,
        },
        sharedAt: (msg.createdAt as Date).toISOString(),
      });
    }
  }

  return successResponse({ items, total: items.length });
});

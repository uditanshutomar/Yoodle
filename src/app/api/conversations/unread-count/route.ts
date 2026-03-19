import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import { getCached, setCache } from "@/lib/infra/redis/cache";

const UNREAD_CACHE_TTL = 10; // seconds — very short TTL for near-realtime badge updates

// ─── GET /api/conversations/unread-count ──────────────────────────────
// Lightweight endpoint that returns only the total unread message count.
// Used by the sidebar badge to avoid fetching + populating all conversations.

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  // Check cache first — prevents the aggregation from running on every sidebar poll
  const cacheKey = `user:unread:${userId}`;
  const cached = await getCached<{ totalUnread: number }>(cacheKey);
  if (cached) {
    return successResponse(cached);
  }

  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Single aggregation pipeline to compute total unread across all conversations.
  // Replaces the previous N+1 pattern (fetch conversations + countDocuments per each).
  const result = await Conversation.aggregate([
    { $match: { "participants.userId": userOid } },
    { $sort: { lastMessageAt: -1 as const } },
    { $limit: 500 },
    // Extract only the current user's participant entry to get their lastReadAt
    {
      $project: {
        _id: 1,
        participant: {
          $arrayElemAt: [
            { $filter: { input: "$participants", as: "p", cond: { $eq: ["$$p.userId", userOid] } } },
            0,
          ],
        },
      },
    },
    {
      $lookup: {
        from: "direct_messages",
        let: {
          convId: "$_id",
          lastRead: { $ifNull: ["$participant.lastReadAt", new Date(0)] },
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$conversationId", "$$convId"] },
                  { $gt: ["$createdAt", "$$lastRead"] },
                  { $ne: ["$senderId", userOid] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "unread",
      },
    },
    {
      $group: {
        _id: null,
        totalUnread: {
          $sum: { $ifNull: [{ $arrayElemAt: ["$unread.count", 0] }, 0] },
        },
      },
    },
  ]);

  const totalUnread = result[0]?.totalUnread ?? 0;
  const data = { totalUnread };

  await setCache(cacheKey, data, UNREAD_CACHE_TTL);

  return successResponse(data);
});

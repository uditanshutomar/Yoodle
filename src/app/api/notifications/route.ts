import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Notification from "@/lib/infra/db/models/notification";

const MAX_LIMIT = 50;

/* ─── GET /api/notifications ─── */

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const url = req.nextUrl;
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, MAX_LIMIT));

  const userOid = new mongoose.Types.ObjectId(userId);
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId: userOid })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId: userOid }),
    Notification.countDocuments({ userId: userOid, read: false }),
  ]);

  return successResponse({
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

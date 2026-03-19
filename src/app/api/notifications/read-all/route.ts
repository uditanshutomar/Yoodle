import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Notification from "@/lib/infra/db/models/notification";

/* ─── POST /api/notifications/read-all ─── */

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const result = await Notification.updateMany(
    { userId: userOid, read: false },
    { $set: { read: true } },
  );

  return successResponse({ modifiedCount: result.modifiedCount });
});

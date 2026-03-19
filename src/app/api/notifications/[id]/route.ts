import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Notification from "@/lib/infra/db/models/notification";

/* ─── PATCH /api/notifications/[id] ─── */

export const PATCH = withHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    await checkRateLimit(req, "general");
    const userId = await getUserIdFromRequest(req);
    const { id } = await context!.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError("Invalid notification ID");
    }

    await connectDB();

    const notification = await Notification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { $set: { read: true } },
      { new: true },
    ).lean();

    if (!notification) {
      throw new NotFoundError("Notification not found");
    }

    return successResponse(notification);
  },
);

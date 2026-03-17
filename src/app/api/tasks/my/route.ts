import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const tasks = await Task.find({
    $or: [{ assigneeId: userOid }, { creatorId: userOid }],
    completedAt: null,
  })
    .sort({ dueDate: 1, priority: 1, createdAt: -1 })
    .limit(50)
    .lean();

  return successResponse(tasks);
});

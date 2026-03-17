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

  const searchParams = req.nextUrl.searchParams;
  const dueDateMin = searchParams.get("dueDateMin");
  const dueDateMax = searchParams.get("dueDateMax");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  // Build match filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchFilter: Record<string, any> = {
    $or: [{ assigneeId: userOid }, { creatorId: userOid }],
    completedAt: null,
  };

  if (dueDateMin || dueDateMax) {
    const dateFilter: Record<string, Date> = {};
    if (dueDateMin) dateFilter.$gte = new Date(dueDateMin);
    if (dueDateMax) dateFilter.$lte = new Date(dueDateMax);
    matchFilter.dueDate = dateFilter;
  }

  // Use aggregation to sort priority by severity (not alphabetically)
  const tasks = await Task.aggregate([
    {
      $match: matchFilter,
    },
    {
      $addFields: {
        priorityOrder: {
          $switch: {
            branches: [
              { case: { $eq: ["$priority", "urgent"] }, then: 0 },
              { case: { $eq: ["$priority", "high"] }, then: 1 },
              { case: { $eq: ["$priority", "medium"] }, then: 2 },
              { case: { $eq: ["$priority", "low"] }, then: 3 },
            ],
            default: 4,
          },
        },
      },
    },
    { $sort: { dueDate: 1, priorityOrder: 1, createdAt: -1 } },
    { $limit: limit },
    { $project: { priorityOrder: 0 } },
  ]);

  return successResponse(tasks);
});

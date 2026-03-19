import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { BadRequestError } from "@/lib/infra/api/errors";
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
  const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200));

  // Build match filter
  const matchFilter: Record<string, unknown> = {
    $or: [{ assigneeId: userOid }, { creatorId: userOid }],
    completedAt: null,
  };

  if (dueDateMin || dueDateMax) {
    const dateFilter: Record<string, Date> = {};
    if (dueDateMin) {
      const d = new Date(dueDateMin);
      if (isNaN(d.getTime())) throw new BadRequestError("Invalid dueDateMin value.");
      dateFilter.$gte = d;
    }
    if (dueDateMax) {
      const d = new Date(dueDateMax);
      if (isNaN(d.getTime())) throw new BadRequestError("Invalid dueDateMax value.");
      dateFilter.$lte = d;
    }
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

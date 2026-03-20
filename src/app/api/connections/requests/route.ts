import { NextRequest } from "next/server";
import mongoose from "mongoose";

import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import Connection from "@/lib/infra/db/models/connection";
import User from "@/lib/infra/db/models/user";

// ─── GET /api/connections/requests — incoming pending requests ──────

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Fetch pending requests where the current user is the recipient
  const connections = await Connection.find({
    recipientId: userOid,
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Batch-fetch requester profiles
  const requesterIds = connections.map((c) => c.requesterId);

  const users = await User.find({ _id: { $in: requesterIds } })
    .select("name displayName avatarUrl status")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const results = connections.map((c) => {
    const requester = userMap.get(c.requesterId.toString());

    return {
      id: c._id.toString(),
      userId: c.requesterId.toString(),
      name: requester?.name ?? null,
      displayName: requester?.displayName ?? null,
      avatarUrl: requester?.avatarUrl ?? null,
      userStatus: requester?.status ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return successResponse(results);
});

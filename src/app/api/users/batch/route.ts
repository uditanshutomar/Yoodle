import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

/**
 * GET /api/users/batch?ids=id1,id2,id3
 * Returns public profile info for a list of user IDs.
 * Max 50 IDs per request. Used by board to resolve member avatars.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  await getUserIdFromRequest(req); // auth required
  await connectDB();

  const idsParam = req.nextUrl.searchParams.get("ids") || "";
  const ids = idsParam.split(",").filter(Boolean).slice(0, 50);

  if (ids.length === 0) {
    throw new BadRequestError("No user IDs provided");
  }

  // Validate all IDs
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) {
    return successResponse([]);
  }

  const users = await User.find({
    _id: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("name displayName avatarUrl")
    .lean();

  return successResponse(users);
});

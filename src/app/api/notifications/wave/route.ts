import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

const waveSchema = z.object({
  targetUserId: z.string().refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    { message: "Invalid target user ID" },
  ),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const body = waveSchema.parse(await req.json());
  await connectDB();

  if (body.targetUserId === userId) {
    throw new BadRequestError("Cannot wave at yourself");
  }

  const targetUser = await User.findById(body.targetUserId).select("_id name").lean();
  if (!targetUser) throw new NotFoundError("User not found");

  // Acknowledge the wave. Full notification delivery (Redis pub/sub -> SSE) is a follow-up.
  return successResponse({ waved: true, targetUserId: body.targetUserId });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { ForbiddenError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import "@/lib/infra/db/models/user";
import { waitingGrantAdmission } from "@/lib/infra/redis/cache";

const bodySchema = z.object({
  userId: z.string().min(1),
});

/**
 * POST /api/meetings/[meetingId]/admit
 *
 * Host admits a user from the waiting room.
 * Sets the Redis admission token so the user's next join attempt succeeds.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  const callerId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;
  const { userId: targetUserId } = bodySchema.parse(await req.json());

  await connectDB();

  const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;
  const filter =
    mongoose.Types.ObjectId.isValid(meetingId) &&
    !MEETING_CODE_REGEX.test(meetingId)
      ? { _id: new mongoose.Types.ObjectId(meetingId) }
      : { code: meetingId.toLowerCase() };

  const meeting = await Meeting.findOne(filter).select("_id hostId").lean();
  if (!meeting) throw new NotFoundError("Meeting not found.");

  // Only the host can admit users
  const hostId =
    typeof meeting.hostId === "string"
      ? meeting.hostId
      : meeting.hostId._id?.toString() ?? meeting.hostId.toString();

  if (hostId !== callerId) {
    throw new ForbiddenError("Only the host can admit users.");
  }

  const roomId = meeting._id.toString();
  await waitingGrantAdmission(roomId, targetUserId);

  return successResponse({ admitted: true });
});

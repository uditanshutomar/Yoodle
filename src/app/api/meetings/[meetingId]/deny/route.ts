import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import "@/lib/infra/db/models/user";
import { waitingSetDenied } from "@/lib/infra/redis/cache";

const bodySchema = z.object({
  userId: z.string().min(1).refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    { message: "Invalid user ID format." }
  ),
});

/**
 * POST /api/meetings/[meetingId]/deny
 *
 * Host denies a user from the waiting room.
 * Sets the Redis denial key so the user's next poll shows "denied".
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
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

  const meeting = await Meeting.findOne(filter).select("_id hostId status").lean();
  if (!meeting) throw new NotFoundError("Meeting not found.");

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new BadRequestError("Cannot deny users in an ended or cancelled meeting.");
  }

  const hostId =
    typeof meeting.hostId === "string"
      ? meeting.hostId
      : meeting.hostId._id?.toString() ?? meeting.hostId.toString();

  if (hostId !== callerId) {
    throw new ForbiddenError("Only the host can deny users.");
  }

  const roomId = meeting._id.toString();
  await waitingSetDenied(roomId, targetUserId);

  return successResponse({ denied: true });
});

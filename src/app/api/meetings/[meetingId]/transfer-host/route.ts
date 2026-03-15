import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meetings:transfer-host");

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (
    mongoose.Types.ObjectId.isValid(meetingId) &&
    !MEETING_CODE_REGEX.test(meetingId)
  ) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

// ── Validation ──────────────────────────────────────────────────────

const transferSchema = z.object({
  newHostUserId: z.string().min(1, "New host user ID is required"),
});

// ── POST /api/meetings/:meetingId/transfer-host ─────────────────────

/**
 * Transfer host role to another participant in the meeting.
 * Only the current host can transfer.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  const body = transferSchema.parse(await req.json());

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const meeting = await Meeting.findOne(filter);

  if (!meeting) throw new NotFoundError("Meeting not found.");

  // Only current host can transfer
  if (meeting.hostId.toString() !== userId) {
    throw new ForbiddenError("Only the current host can transfer the host role.");
  }

  // Can't transfer to yourself
  if (body.newHostUserId === userId) {
    throw new BadRequestError("You are already the host.");
  }

  // Verify new host is an active participant
  const newHostParticipant = meeting.participants.find(
    (p) =>
      p.userId.toString() === body.newHostUserId && p.status === "joined",
  );

  if (!newHostParticipant) {
    throw new BadRequestError(
      "Target user is not an active participant in this meeting.",
    );
  }

  // Transfer host
  await Meeting.updateOne(
    { _id: meeting._id },
    { $set: { hostId: new mongoose.Types.ObjectId(body.newHostUserId) } },
  );

  log.info(
    {
      meetingId: meeting._id.toString(),
      previousHostId: userId,
      newHostId: body.newHostUserId,
    },
    "host manually transferred",
  );

  return successResponse({
    data: {
      meetingId: meeting._id.toString(),
      newHostUserId: body.newHostUserId,
    },
    message: "Host role transferred.",
  });
});

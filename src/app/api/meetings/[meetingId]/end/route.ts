import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");

// ── POST /api/meetings/:meetingId/end ───────────────────────────────

/**
 * End a meeting. Only the host can end.
 * Sets status to "ended", records endedAt,
 * and marks all remaining participants as "left".
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const meeting = await Meeting.findOne(filter);

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  // Only host can end
  if (meeting.hostId.toString() !== userId) {
    throw new ForbiddenError("Only the host can end this meeting.");
  }

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new BadRequestError("Meeting is already ended or cancelled.");
  }

  // End the meeting
  meeting.status = "ended";
  meeting.endedAt = new Date();

  // Mark all remaining joined participants as "left"
  const now = new Date();
  for (const participant of meeting.participants) {
    if (participant.status === "joined") {
      participant.status = "left";
      participant.leftAt = now;
    }
  }

  await meeting.save();

  // Populate for response
  await meeting.populate("hostId", "name email displayName avatarUrl");
  await meeting.populate("participants.userId", "name email displayName avatarUrl");

  return successResponse({
    data: { meeting },
    message: "Meeting ended successfully.",
  });
});

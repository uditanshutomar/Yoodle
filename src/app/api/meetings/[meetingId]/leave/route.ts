import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/api/errors";
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

// ── POST /api/meetings/:meetingId/leave ─────────────────────────────

/**
 * Leave a meeting.
 * Updates participant status to "left".
 * If the host leaves and no other participants remain, ends the meeting.
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

  // Find the participant
  const participant = meeting.participants.find(
    (p) => p.userId.toString() === userId
  );

  if (!participant) {
    throw new BadRequestError("You are not a participant in this meeting.");
  }

  if (participant.status === "left") {
    throw new BadRequestError("You have already left this meeting.");
  }

  // Mark participant as left
  participant.status = "left";
  participant.leftAt = new Date();

  // Check if host is leaving
  const isHost = meeting.hostId.toString() === userId;

  if (isHost) {
    // Check if any other participants are still in the meeting
    const remainingParticipants = meeting.participants.filter(
      (p) => p.userId.toString() !== userId && p.status === "joined"
    );

    if (remainingParticipants.length === 0) {
      // No other participants, end the meeting
      meeting.status = "ended";
      meeting.endedAt = new Date();
    }
  }

  await meeting.save();

  // Populate for response
  await meeting.populate("hostId", "name email displayName avatarUrl");
  await meeting.populate("participants.userId", "name email displayName avatarUrl");

  return successResponse({
    data: { meeting },
    message: "You have left the meeting.",
  });
});

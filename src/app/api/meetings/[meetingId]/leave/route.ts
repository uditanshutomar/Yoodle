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
 *
 * Atomically updates the participant status to "left" using
 * findOneAndUpdate so concurrent leave requests cannot conflict.
 * If the host leaves and no other participants remain, ends the meeting.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // ── Atomically mark participant as "left" ─────────────────────────
  const result = await Meeting.findOneAndUpdate(
    {
      ...filter,
      participants: {
        $elemMatch: { userId: userObjectId, status: "joined" },
      },
    },
    {
      $set: {
        "participants.$.status": "left",
        "participants.$.leftAt": new Date(),
      },
    },
    { new: true },
  );

  if (!result) {
    // Determine the reason for failure
    const meeting = await Meeting.findOne(filter);
    if (!meeting) {
      throw new NotFoundError("Meeting not found.");
    }
    const participant = meeting.participants.find(
      (p) => p.userId.toString() === userId,
    );
    if (!participant) {
      throw new BadRequestError("You are not a participant in this meeting.");
    }
    if (participant.status === "left") {
      throw new BadRequestError("You have already left this meeting.");
    }
    throw new BadRequestError("Cannot leave this meeting.");
  }

  // ── End meeting if host left and nobody else remains ──────────────
  const isHost = result.hostId.toString() === userId;
  if (isHost) {
    const remainingParticipants = result.participants.filter(
      (p) => p.userId.toString() !== userId && p.status === "joined",
    );

    if (remainingParticipants.length === 0) {
      // Atomic — only transitions if still live/scheduled (idempotent)
      await Meeting.updateOne(
        { _id: result._id, status: { $nin: ["ended", "cancelled"] } },
        { $set: { status: "ended", endedAt: new Date() } },
      );
    }
  }

  // Fetch final state with populated fields
  const populated = await Meeting.findById(result._id)
    .populate("hostId", "name email displayName avatarUrl")
    .populate("participants.userId", "name email displayName avatarUrl");

  return successResponse({
    data: { meeting: populated },
    message: "You have left the meeting.",
  });
});

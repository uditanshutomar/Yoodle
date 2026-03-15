import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { updateEvent } from "@/lib/google/calendar";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meetings:leave");

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

  // ── Host succession or end meeting ──────────────────────────────────
  const isHost = result.hostId.toString() === userId;
  const remainingParticipants = result.participants.filter(
    (p) => p.userId.toString() !== userId && p.status === "joined",
  );

  if (remainingParticipants.length === 0) {
    // Nobody left — end the meeting regardless of who left
    const endedAt = new Date();

    await Meeting.updateOne(
      { _id: result._id, status: { $nin: ["ended", "cancelled"] } },
      { $set: { status: "ended", endedAt } },
    );

    // Sync calendar event to actual meeting duration (rounded to 15-min slots)
    if (result.calendarEventId) {
      try {
        const startTime = result.startedAt || result.scheduledAt || result.createdAt;
        const actualMinutes = Math.max(1, (endedAt.getTime() - startTime.getTime()) / 60000);
        const roundedMinutes = Math.max(15, Math.round(actualMinutes / 15) * 15);
        const newEnd = new Date(startTime.getTime() + roundedMinutes * 60000);

        await updateEvent(userId, result.calendarEventId, {
          end: newEnd.toISOString(),
        });
      } catch (calErr) {
        log.warn({ err: calErr }, "failed to sync calendar end time after meeting");
      }
    }
  } else if (isHost) {
    // Host left but others remain — transfer host to the earliest-joined participant
    const newHost = remainingParticipants.sort(
      (a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0),
    )[0];

    await Meeting.updateOne(
      { _id: result._id },
      { $set: { hostId: newHost.userId } },
    );

    log.info(
      { meetingId: result._id.toString(), newHostId: newHost.userId.toString() },
      "host transferred after original host left",
    );
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

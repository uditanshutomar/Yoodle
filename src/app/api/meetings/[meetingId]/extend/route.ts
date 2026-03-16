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
import { updateEvent } from "@/lib/google/calendar";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meetings:extend");

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

/** Round minutes to nearest 15-min slot (minimum 15) */
function roundTo15(minutes: number): number {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

// ── Validation ──────────────────────────────────────────────────────

const extendSchema = z.object({
  additionalMinutes: z.number().min(5).max(480),
});

// ── POST /api/meetings/:meetingId/extend ────────────────────────────

/**
 * Extend a live meeting's scheduled duration.
 * Updates both the Meeting doc and the linked Google Calendar event.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  const body = extendSchema.parse(await req.json());

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const meeting = await Meeting.findOne(filter)
    .select("hostId status scheduledDuration calendarEventId scheduledAt startedAt createdAt");

  if (!meeting) throw new NotFoundError("Meeting not found.");
  if (meeting.hostId.toString() !== userId) {
    throw new ForbiddenError("Only the meeting host can extend the meeting.");
  }
  if (meeting.status !== "live") {
    throw new BadRequestError("Can only extend a live meeting.");
  }

  // Calculate new duration
  const oldDuration = meeting.scheduledDuration || 15;
  const newDuration = roundTo15(oldDuration + body.additionalMinutes);

  // Update meeting
  meeting.scheduledDuration = newDuration;
  await meeting.save();

  // Update Google Calendar event if linked
  let calendarUpdated = false;
  if (meeting.calendarEventId) {
    try {
      const startTime = meeting.scheduledAt || meeting.startedAt || meeting.createdAt;
      const newEnd = new Date(startTime.getTime() + newDuration * 60000);
      await updateEvent(userId, meeting.calendarEventId, {
        end: newEnd.toISOString(),
      });
      calendarUpdated = true;
    } catch (err) {
      log.warn({ err, meetingId: meeting._id.toString() }, "failed to sync calendar after meeting extend");
    }
  }

  return successResponse({
    meetingId: meeting._id.toString(),
    scheduledDuration: newDuration,
    calendarUpdated,
  });
});

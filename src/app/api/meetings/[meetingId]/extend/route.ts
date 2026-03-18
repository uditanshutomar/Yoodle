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
import { buildMeetingFilter } from "@/lib/meetings/helpers";

const log = createLogger("meetings:extend");

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
  const roundedMinutes = roundTo15(body.additionalMinutes);

  // Atomic extend: merge authorization (host check) into the update filter,
  // use $inc to avoid read-then-write race, and $expr to enforce 480-min cap.
  const meeting = await Meeting.findOneAndUpdate(
    {
      ...filter,
      hostId: new mongoose.Types.ObjectId(userId),
      status: "live",
      $expr: {
        $lte: [
          { $add: [{ $ifNull: ["$scheduledDuration", 15] }, roundedMinutes] },
          480,
        ],
      },
    },
    { $inc: { scheduledDuration: roundedMinutes } },
    { new: true, projection: { _id: 1, scheduledDuration: 1, calendarEventId: 1, scheduledAt: 1, startedAt: 1, createdAt: 1, hostId: 1, status: 1 } },
  );

  if (!meeting) {
    // Determine the reason for failure
    const existing = await Meeting.findOne(filter).select("hostId status scheduledDuration").lean();
    if (!existing) throw new NotFoundError("Meeting not found.");
    if (existing.hostId.toString() !== userId) {
      throw new ForbiddenError("Only the meeting host can extend the meeting.");
    }
    if (existing.status !== "live") {
      throw new BadRequestError("Can only extend a live meeting.");
    }
    throw new BadRequestError("Meeting is already at maximum duration (8 hours).");
  }

  const newDuration = meeting.scheduledDuration ?? roundedMinutes;

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

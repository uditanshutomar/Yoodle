import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { deleteEvent } from "@/lib/google/calendar";
import "@/lib/infra/db/models/user"; // register User schema for .populate("hostId")

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

/**
 * Build a Mongoose filter that matches either an ObjectId or a meeting code.
 */
function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");

const updateMeetingSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer.")
    .optional(),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO datetime." })
    .optional()
    .nullable(),
  settings: z
    .object({
      maxParticipants: z.number().int().min(1).max(100).optional(),
      allowRecording: z.boolean().optional(),
      allowScreenShare: z.boolean().optional(),
      waitingRoom: z.boolean().optional(),
      muteOnJoin: z.boolean().optional(),
    })
    .optional(),
});

// ── GET /api/meetings/:meetingId ────────────────────────────────────

/**
 * Get meeting details by ObjectId or meeting code.
 *
 * Access rules:
 *  - Any authenticated user can look up a meeting (needed for joining via code).
 *  - Non-participants receive limited info (title, code, status, participant count)
 *    so the pre-join lobby can render.
 *  - Hosts and existing participants receive the full meeting document.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const meeting = await Meeting.findOne(filter)
    .populate("hostId", "name email displayName avatarUrl")
    .populate("participants.userId", "name email displayName avatarUrl")
    .lean();

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  // Check if user is host or participant
  const isHost = meeting.hostId._id?.toString() === userId ||
    (meeting.hostId as unknown as mongoose.Types.ObjectId).toString() === userId;
  const isParticipant = meeting.participants.some(
    (p) => p.userId?.toString() === userId || p.userId?._id?.toString() === userId
  );

  if (isHost || isParticipant) {
    // Full access -- return everything
    return successResponse(meeting);
  }

  // Non-participant: return limited info so the lobby/join page can render
  return successResponse({
    _id: meeting._id,
    title: meeting.title,
    code: meeting.code,
    status: meeting.status,
    type: meeting.type,
    hostId: meeting.hostId,
    settings: {
      waitingRoom: meeting.settings?.waitingRoom ?? false,
    },
    participants: meeting.participants.map((p) => ({
      status: p.status,
    })),
  });
});

// ── PATCH /api/meetings/:meetingId ──────────────────────────────────

/**
 * Update meeting details. Only the host can update.
 * Updatable fields: title, scheduledAt, settings.
 */
export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  const updates = updateMeetingSchema.parse(await req.json());

  await connectDB();

  // Build update fields
  const updateFields: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    updateFields.title = updates.title;
  }
  if (updates.scheduledAt !== undefined) {
    updateFields.scheduledAt = updates.scheduledAt
      ? new Date(updates.scheduledAt)
      : null;
  }
  if (updates.settings !== undefined) {
    // Validate maxParticipants against feature flags
    if (updates.settings.maxParticipants !== undefined) {
      const { features } = await import("@/lib/features/flags");
      if (updates.settings.maxParticipants > features.maxParticipantsPerRoom) {
        throw new BadRequestError(
          `Maximum ${features.maxParticipantsPerRoom} participants allowed on ${features.edition} edition`
        );
      }
    }

    // Merge individual settings fields
    for (const [key, value] of Object.entries(updates.settings)) {
      if (value !== undefined) {
        updateFields[`settings.${key}`] = value;
      }
    }
  }

  if (Object.keys(updateFields).length === 0) {
    throw new BadRequestError("No valid fields to update.");
  }

  // Atomic update: filter ensures caller is host and meeting is active
  const filter = buildMeetingFilter(meetingId);
  const updatedMeeting = await Meeting.findOneAndUpdate(
    {
      ...filter,
      hostId: new mongoose.Types.ObjectId(userId),
      status: { $nin: ["ended", "cancelled"] },
    },
    { $set: updateFields },
    { new: true, runValidators: true }
  )
    .populate("hostId", "name email displayName avatarUrl")
    .populate("participants.userId", "name email displayName avatarUrl");

  if (!updatedMeeting) {
    // Determine the reason for failure
    const meeting = await Meeting.findOne(filter).select("hostId status").lean();
    if (!meeting) throw new NotFoundError("Meeting not found.");
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      throw new BadRequestError("Cannot update an ended or cancelled meeting.");
    }
    throw new ForbiddenError("Only the host can update this meeting.");
  }

  return successResponse({ meeting: updatedMeeting });
});

// ── DELETE /api/meetings/:meetingId ─────────────────────────────────

/**
 * Cancel/delete a meeting (soft delete: sets status to "ended").
 * Only the host can delete.
 */
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  const filter = buildMeetingFilter(meetingId);

  // Atomic cancel: filter ensures host-only, non-ended, single write
  const result = await Meeting.findOneAndUpdate(
    {
      ...filter,
      hostId: new mongoose.Types.ObjectId(userId),
      status: { $nin: ["ended", "cancelled"] },
    },
    { $set: { status: "cancelled", endedAt: new Date() } },
    { new: true, projection: { _id: 1, status: 1, calendarEventId: 1 } },
  );

  // Clean up Google Calendar event if one was created
  if (result?.calendarEventId) {
    try {
      await deleteEvent(userId, result.calendarEventId);
    } catch {
      // Calendar cleanup is best-effort — don't fail the meeting cancellation
      // The event may already have been deleted externally
    }
  }

  if (!result) {
    // Distinguish "not found" from "forbidden" from "already cancelled"
    const meeting = await Meeting.findOne(filter)
      .select("hostId status")
      .lean();
    if (!meeting) {
      throw new NotFoundError("Meeting not found.");
    }
    if (meeting.hostId.toString() !== userId) {
      throw new ForbiddenError("Only the host can cancel this meeting.");
    }
    throw new BadRequestError("Meeting is already ended or cancelled.");
  }

  return successResponse({ cancelled: true });
});

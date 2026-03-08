import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

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

// ── Route context type ──────────────────────────────────────────────

type RouteContext = { params: Promise<{ meetingId: string }> };

// ── GET /api/meetings/:meetingId ────────────────────────────────────

/**
 * Get meeting details by ObjectId or meeting code.
 * Only accessible by host or participants.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { meetingId } = await context.params;

    await connectDB();

    const filter = buildMeetingFilter(meetingId);
    const meeting = await Meeting.findOne(filter)
      .populate("hostId", "name email displayName avatarUrl")
      .populate("participants.userId", "name email displayName avatarUrl")
      .lean();

    if (!meeting) {
      return notFoundResponse("Meeting not found.");
    }

    // Check access: user must be host or a participant
    const isHost = meeting.hostId._id?.toString() === userId ||
      (meeting.hostId as unknown as mongoose.Types.ObjectId).toString() === userId;
    const isParticipant = meeting.participants.some(
      (p) => p.userId?.toString() === userId || p.userId?._id?.toString() === userId
    );

    if (!isHost && !isParticipant) {
      return forbiddenResponse("You do not have access to this meeting.");
    }

    return successResponse(meeting);
  } catch (error) {
    console.error("[Meeting GET Error]", error);
    return serverErrorResponse("Failed to retrieve meeting.");
  }
}

// ── PATCH /api/meetings/:meetingId ──────────────────────────────────

/**
 * Update meeting details. Only the host can update.
 * Updatable fields: title, scheduledAt, settings.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { meetingId } = await context.params;

    const body = await request.json();

    const parsed = updateMeetingSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: fieldErrors,
      });
    }

    const updates = parsed.data;

    await connectDB();

    const filter = buildMeetingFilter(meetingId);
    const meeting = await Meeting.findOne(filter);

    if (!meeting) {
      return notFoundResponse("Meeting not found.");
    }

    // Only host can update
    if (meeting.hostId.toString() !== userId) {
      return forbiddenResponse("Only the host can update this meeting.");
    }

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
      // Merge individual settings fields
      for (const [key, value] of Object.entries(updates.settings)) {
        if (value !== undefined) {
          updateFields[`settings.${key}`] = value;
        }
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return errorResponse({
        message: "No valid fields to update.",
        status: 400,
      });
    }

    const updatedMeeting = await Meeting.findOneAndUpdate(
      filter,
      { $set: updateFields },
      { new: true, runValidators: true }
    )
      .populate("hostId", "name email displayName avatarUrl")
      .populate("participants.userId", "name email displayName avatarUrl");

    return successResponse({
      data: { meeting: updatedMeeting },
      message: "Meeting updated successfully.",
    });
  } catch (error) {
    console.error("[Meeting PATCH Error]", error);
    return serverErrorResponse("Failed to update meeting.");
  }
}

// ── DELETE /api/meetings/:meetingId ─────────────────────────────────

/**
 * Cancel/delete a meeting (soft delete: sets status to "ended").
 * Only the host can delete.
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { meetingId } = await context.params;

    await connectDB();

    const filter = buildMeetingFilter(meetingId);
    const meeting = await Meeting.findOne(filter);

    if (!meeting) {
      return notFoundResponse("Meeting not found.");
    }

    // Only host can delete
    if (meeting.hostId.toString() !== userId) {
      return forbiddenResponse("Only the host can cancel this meeting.");
    }

    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return errorResponse({
        message: "Meeting is already ended or cancelled.",
        status: 400,
      });
    }

    meeting.status = "cancelled";
    meeting.endedAt = new Date();
    await meeting.save();

    return successResponse({
      message: "Meeting cancelled successfully.",
    });
  } catch (error) {
    console.error("[Meeting DELETE Error]", error);
    return serverErrorResponse("Failed to cancel meeting.");
  }
}

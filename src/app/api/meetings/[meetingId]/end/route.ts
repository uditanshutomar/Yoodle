import { NextRequest } from "next/server";
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

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

// ── Route context type ──────────────────────────────────────────────

type RouteContext = { params: Promise<{ meetingId: string }> };

// ── POST /api/meetings/:meetingId/end ───────────────────────────────

/**
 * End a meeting. Only the host can end.
 * Sets status to "ended", records endedAt,
 * and marks all remaining participants as "left".
 */
export async function POST(
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

    // Only host can end
    if (meeting.hostId.toString() !== userId) {
      return forbiddenResponse("Only the host can end this meeting.");
    }

    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return errorResponse({
        message: "Meeting is already ended or cancelled.",
        status: 400,
      });
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
  } catch (error) {
    console.error("[Meeting End Error]", error);
    return serverErrorResponse("Failed to end meeting.");
  }
}

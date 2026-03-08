import { NextRequest } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
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

// ── POST /api/meetings/:meetingId/leave ─────────────────────────────

/**
 * Leave a meeting.
 * Updates participant status to "left".
 * If the host leaves and no other participants remain, ends the meeting.
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

    // Find the participant
    const participant = meeting.participants.find(
      (p) => p.userId.toString() === userId
    );

    if (!participant) {
      return errorResponse({
        message: "You are not a participant in this meeting.",
        status: 400,
      });
    }

    if (participant.status === "left") {
      return errorResponse({
        message: "You have already left this meeting.",
        status: 400,
      });
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
  } catch (error) {
    console.error("[Meeting Leave Error]", error);
    return serverErrorResponse("Failed to leave meeting.");
  }
}

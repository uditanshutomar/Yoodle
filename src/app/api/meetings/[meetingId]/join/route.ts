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
import { determineTransportMode } from "@/lib/transport/transport-factory";

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

function getIceServers() {
  const servers: Record<string, unknown>[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
      ],
    },
  ];

  if (process.env.TURN_SERVER_URL) {
    servers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return servers;
}

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");

// ── POST /api/meetings/:meetingId/join ──────────────────────────────

/**
 * Join a meeting by ObjectId or meeting code.
 * Adds the user to participants, activates the meeting if scheduled,
 * and returns ICE server configuration for WebRTC.
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

  // Cannot join ended or cancelled meetings
  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new BadRequestError("This meeting has already ended.");
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Check if user is already a participant with "joined" status
  const existingParticipant = meeting.participants.find(
    (p) => p.userId.toString() === userId
  );

  // Determine transport mode for this meeting
  const effectiveTransportMode: "p2p" | "livekit" =
    meeting.transportMode === "p2p" || meeting.transportMode === "livekit"
      ? meeting.transportMode
      : determineTransportMode(meeting.settings.maxParticipants);

  if (existingParticipant) {
    if (existingParticipant.status === "joined") {
      // Already joined, just return the meeting + ICE servers
      await meeting.populate("hostId", "name email displayName avatarUrl");
      await meeting.populate("participants.userId", "name email displayName avatarUrl");

      return successResponse({
        meeting,
        iceServers: getIceServers(),
        transportMode: effectiveTransportMode,
      });
    }

    // User was previously in the meeting (left/invited) - rejoin
    existingParticipant.status = "joined";
    existingParticipant.joinedAt = new Date();
    existingParticipant.leftAt = undefined;
  } else {
    // Check maxParticipants limit
    const activeParticipants = meeting.participants.filter(
      (p) => p.status === "joined"
    ).length;

    if (activeParticipants >= meeting.settings.maxParticipants) {
      throw new BadRequestError("Meeting has reached the maximum number of participants.");
    }

    // Add as new participant
    meeting.participants.push({
      userId: userObjectId,
      role: "participant",
      status: "joined",
      joinedAt: new Date(),
    });
  }

  // Activate meeting if it's scheduled
  if (meeting.status === "scheduled") {
    meeting.status = "live";
    meeting.startedAt = new Date();
  }

  await meeting.save();

  // Populate for response
  await meeting.populate("hostId", "name email displayName avatarUrl");
  await meeting.populate("participants.userId", "name email displayName avatarUrl");

  return successResponse({
    meeting,
    iceServers: getIceServers(),
    transportMode: effectiveTransportMode,
  });
});

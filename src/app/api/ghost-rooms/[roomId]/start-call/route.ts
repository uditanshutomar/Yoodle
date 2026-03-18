import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import GhostRoom from "@/lib/infra/db/models/ghost-room";
import Meeting from "@/lib/infra/db/models/meeting";
import { generateMeetingCode } from "@/lib/utils/id";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:ghost-start-call");

/**
 * POST /api/ghost-rooms/:roomId/start-call
 *
 * Creates a ghost-type meeting linked to the ghost room so participants
 * can join a LiveKit A/V call. Recording & transcription are disabled
 * by default for ghost meetings. If a call was already started (meetingId
 * exists on the ghost room), the existing meetingId is returned.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { roomId } = await context!.params;

  await connectDB();

  const ghostRoom = await GhostRoom.findOne({
    roomId,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!ghostRoom) {
    throw new NotFoundError("Ghost room not found or has expired.");
  }

  const isParticipant = ghostRoom.participants.some(
    (p) => p.userId === userId,
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this ghost room.");
  }

  // If a meeting already exists for this ghost room, return it
  if (ghostRoom.meetingId) {
    const existing = await Meeting.findById(ghostRoom.meetingId)
      .select("_id code status")
      .lean();
    if (existing && existing.status !== "ended" && existing.status !== "cancelled") {
      return successResponse({
        meetingId: existing._id.toString(),
        code: existing.code,
        alreadyStarted: true,
      });
    }
  }

  // Create a ghost-type meeting
  const code = generateMeetingCode();
  const participants = ghostRoom.participants.map((p) => ({
    userId: new mongoose.Types.ObjectId(p.userId),
    role: p.userId === ghostRoom.hostId ? ("host" as const) : ("participant" as const),
    joinedAt: new Date(),
    status: "joined" as const,
  }));

  const meeting = await Meeting.create({
    code,
    title: ghostRoom.title,
    description: `Ghost room call — recording & transcription disabled until consensus.`,
    hostId: new mongoose.Types.ObjectId(ghostRoom.hostId),
    participants,
    status: "live",
    startedAt: new Date(),
    type: "ghost",
    settings: {
      maxParticipants: 25,
      allowRecording: false,
      allowScreenShare: true,
      waitingRoom: false,
      muteOnJoin: false,
    },
  });

  // Atomically link meeting to ghost room — only succeeds if meetingId
  // is still unset, preventing a duplicate meeting from a concurrent request.
  const linked = await GhostRoom.findOneAndUpdate(
    { roomId, $or: [{ meetingId: { $exists: false } }, { meetingId: null }, { meetingId: "" }] },
    { $set: { meetingId: meeting._id.toString() } },
    { new: true },
  );

  if (!linked) {
    // Another request beat us — clean up the orphaned meeting
    await Meeting.deleteOne({ _id: meeting._id });
    log.warn({ roomId }, "concurrent start-call race — cleaned up duplicate meeting");

    // Return the meeting that the other request created
    const freshRoom = await GhostRoom.findOne({ roomId }).select("meetingId").lean();
    if (freshRoom?.meetingId) {
      const existingMeeting = await Meeting.findById(freshRoom.meetingId)
        .select("_id code")
        .lean();
      if (existingMeeting) {
        return successResponse({
          meetingId: existingMeeting._id.toString(),
          code: existingMeeting.code,
          alreadyStarted: true,
        });
      }
    }
    // The ghost room expired or the winner's meeting was also deleted.
    // We already cleaned up ours, so nothing useful to return.
    throw new NotFoundError("Ghost room expired during call setup. Please rejoin.");
  }

  log.info(
    { roomId, meetingId: meeting._id.toString() },
    "ghost room call started",
  );

  return successResponse({
    meetingId: meeting._id.toString(),
    code: meeting.code,
    alreadyStarted: false,
  });
});

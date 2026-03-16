import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import { checkConsensus, persistGhostData } from "@/lib/ghost/consensus";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:ghost-rooms");

// -- Helpers -------------------------------------------------------------------

const GHOST_CODE_REGEX = /^ghost-[a-z0-9]{3}-[a-z0-9]{3}$/;

async function findRoom(roomId: string) {
  if (GHOST_CODE_REGEX.test(roomId)) {
    return ephemeralStore.getRoomByCode(roomId);
  }
  return ephemeralStore.getRoom(roomId);
}

const patchSchema = z.object({
  action: z.enum(["addMessage", "updateNotes", "join"]),
  content: z.string().min(1).optional(),
  notes: z.string().optional(),
  name: z.string().optional(),
  displayName: z.string().optional(),
});

// -- GET /api/ghost-rooms/:roomId ----------------------------------------------

/**
 * Get ghost room details. The roomId can be a room ID or a ghost code.
 * User must be a participant to access.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { roomId } = await context!.params;
  const room = await findRoom(roomId);

  if (!room) {
    throw new NotFoundError("Ghost room not found or has expired.");
  }

  // Must be a participant
  if (!room.participants.has(userId)) {
    // Auto-join if accessing by code (for room sharing)
    if (GHOST_CODE_REGEX.test(roomId)) {
      // Look up the user's real name for the participant entry
      await connectDB();
      const joiningUser = await User.findById(userId).select("name displayName").lean();
      const joinerName = joiningUser?.name || "Unknown";
      const joinerDisplayName = joiningUser?.displayName || joinerName;
      await ephemeralStore.addParticipant(room.roomId, userId, joinerName, joinerDisplayName);
      const updatedRoom = await ephemeralStore.getRoom(room.roomId);
      if (!updatedRoom) {
        throw new NotFoundError("Ghost room not found or has expired.");
      }
      const participantsArray = Array.from(updatedRoom.participants.values());
      const consensus = checkConsensus(participantsArray);
      return successResponse({
        roomId: updatedRoom.roomId,
        code: updatedRoom.code,
        title: updatedRoom.title,
        hostId: updatedRoom.hostId,
        createdAt: updatedRoom.createdAt,
        expiresAt: updatedRoom.expiresAt,
        participantCount: participantsArray.length,
        participants: participantsArray,
        messages: updatedRoom.messages,
        notes: updatedRoom.notes,
        meetingId: updatedRoom.meetingId || null,
        votes: consensus,
      });
    }
    throw new ForbiddenError("You are not a participant in this ghost room.");
  }

  // Serialise Maps
  const participantsArray = Array.from(room.participants.values());
  const consensus = checkConsensus(participantsArray);

  return successResponse({
    roomId: room.roomId,
    code: room.code,
    title: room.title,
    hostId: room.hostId,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    participantCount: participantsArray.length,
    participants: participantsArray,
    messages: room.messages,
    notes: room.notes,
    meetingId: room.meetingId || null,
    votes: consensus,
  });
});

// -- PATCH /api/ghost-rooms/:roomId --------------------------------------------

/**
 * Perform actions on a ghost room: addMessage, updateNotes, join.
 */
export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { roomId: rawRoomId } = await context!.params;
  const body = patchSchema.parse(await req.json());
  const { action } = body;

  // Resolve the room first — rawRoomId could be a ghost code or an actual roomId.
  // Always use room.roomId for subsequent store operations.
  const room = await findRoom(rawRoomId);
  if (!room) {
    throw new NotFoundError("Ghost room not found or has expired.");
  }

  const resolvedRoomId = room.roomId;

  if (action === "addMessage") {
    const { content } = body;
    if (!content || content.trim().length === 0) {
      throw new BadRequestError("Message content is required.");
    }

    const participant = room.participants.get(userId);
    if (!participant) {
      throw new ForbiddenError("You are not a participant in this ghost room.");
    }

    const message = await ephemeralStore.addMessage(resolvedRoomId, {
      senderId: userId,
      senderName: participant.displayName || participant.name,
      content: content.trim(),
      timestamp: Date.now(),
      type: "text",
    });

    if (!message) {
      throw new Error("Failed to add message.");
    }

    return successResponse(message);
  }

  if (action === "updateNotes") {
    const participant = room.participants.get(userId);
    if (!participant) {
      throw new ForbiddenError("You are not a participant in this ghost room.");
    }

    const { notes } = body;
    if (typeof notes !== "string") {
      throw new BadRequestError("Notes must be a string.");
    }
    if (notes.length > 10000) {
      throw new BadRequestError("Notes must be 10 000 characters or fewer.");
    }

    const success = await ephemeralStore.updateNotes(resolvedRoomId, notes);
    if (!success) {
      throw new NotFoundError("Ghost room not found or has expired.");
    }

    return successResponse({ updated: true });
  }

  if (action === "join") {
    let { name, displayName } = body;
    // If name not provided in request body, look up from DB
    if (!name) {
      await connectDB();
      const joiningUser = await User.findById(userId).select("name displayName").lean();
      name = joiningUser?.name || "Unknown";
      displayName = displayName || joiningUser?.displayName || name;
    }
    const success = await ephemeralStore.addParticipant(
      resolvedRoomId,
      userId,
      name,
      displayName
    );

    if (!success) {
      throw new NotFoundError("Ghost room not found or has expired.");
    }

    return successResponse({ joined: true });
  }

  throw new BadRequestError("Invalid action. Use: addMessage, updateNotes, join.");
});

// -- DELETE /api/ghost-rooms/:roomId -------------------------------------------

/**
 * End/destroy a ghost room. Only the host can end it.
 * If all participants voted to save, data is persisted to MongoDB first.
 */
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { roomId } = await context!.params;
  const room = await findRoom(roomId);

  if (!room) {
    throw new NotFoundError("Ghost room not found or has expired.");
  }

  // Only host can end the room
  if (room.hostId !== userId) {
    throw new ForbiddenError("Only the host can end this ghost room.");
  }

  // Attempt atomic claim+destroy if consensus is met (prevents double persist).
  // claimAndDestroyRoom only succeeds if ALL participants voted to save.
  let savedMeetingId: string | null = null;
  let claimed = false;

  const participantsArray = Array.from(room.participants.values());
  const consensus = checkConsensus(participantsArray);

  if (consensus.allVoted && consensus.totalParticipants > 0) {
    try {
      const claimedRoom = await ephemeralStore.claimAndDestroyRoom(room.roomId);
      if (claimedRoom) {
        claimed = true;
        const result = await persistGhostData(claimedRoom);
        savedMeetingId = result.meetingId;
      }
    } catch (err) {
      log.error({ err }, "failed to persist ghost room data");
      // Room may already be destroyed by claimAndDestroyRoom; fall through
    }
  }

  // If we didn't claim (no consensus or claim lost race), destroy normally
  if (!claimed) {
    await ephemeralStore.destroyRoom(room.roomId);
  }

  return successResponse({
    destroyed: true,
    dataSaved: savedMeetingId !== null,
    meetingId: savedMeetingId,
    votes: consensus,
  });
});

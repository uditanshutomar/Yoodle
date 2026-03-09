import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import { checkConsensus, persistGhostData } from "@/lib/ghost/consensus";

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
      await ephemeralStore.addParticipant(room.roomId, userId, userId);
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

  const { roomId } = await context!.params;
  const body = patchSchema.parse(await req.json());
  const { action } = body;

  if (action === "addMessage") {
    const { content } = body;
    if (!content || content.trim().length === 0) {
      throw new BadRequestError("Message content is required.");
    }

    // Get the room to find participant name (supports both room IDs and ghost codes)
    const room = await findRoom(roomId);
    if (!room) {
      throw new NotFoundError("Ghost room not found or has expired.");
    }

    const participant = room.participants.get(userId);
    if (!participant) {
      throw new ForbiddenError("You are not a participant in this ghost room.");
    }

    const message = await ephemeralStore.addMessage(roomId, {
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
    const { notes } = body;
    if (typeof notes !== "string") {
      throw new BadRequestError("Notes must be a string.");
    }

    const success = await ephemeralStore.updateNotes(roomId, notes);
    if (!success) {
      throw new NotFoundError("Ghost room not found or has expired.");
    }

    return successResponse({ updated: true });
  }

  if (action === "join") {
    const { name, displayName } = body;
    const success = await ephemeralStore.addParticipant(
      roomId,
      userId,
      name || userId,
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

  // Check if all participants voted to save
  const participantsArray = Array.from(room.participants.values());
  const consensus = checkConsensus(participantsArray);
  let savedMeetingId: string | null = null;

  if (consensus.allVoted && consensus.totalParticipants > 0) {
    try {
      const result = await persistGhostData(room);
      savedMeetingId = result.meetingId;
    } catch (err) {
      console.error("[Ghost Room] Failed to persist data:", err);
      // Still destroy the room even if persistence fails
    }
  }

  // Destroy the room
  await ephemeralStore.destroyRoom(room.roomId);

  return successResponse({
    data: {
      destroyed: true,
      dataSaved: savedMeetingId !== null,
      meetingId: savedMeetingId,
      votes: consensus,
    },
    message: savedMeetingId
      ? "Ghost room ended. Data was saved by unanimous vote."
      : "Ghost room ended. All data has been destroyed.",
  });
});

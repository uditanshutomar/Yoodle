import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import { checkConsensus, persistGhostData } from "@/lib/ghost/consensus";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Route context type ────────────────────────────────────────────────

type RouteContext = { params: Promise<{ roomId: string }> };

// ── Helpers ───────────────────────────────────────────────────────────

const GHOST_CODE_REGEX = /^ghost-[a-z0-9]{3}-[a-z0-9]{3}$/;

async function findRoom(roomId: string) {
  if (GHOST_CODE_REGEX.test(roomId)) {
    return ephemeralStore.getRoomByCode(roomId);
  }
  return ephemeralStore.getRoom(roomId);
}

// ── GET /api/ghost-rooms/:roomId ──────────────────────────────────────

/**
 * Get ghost room details. The roomId can be a room ID or a ghost code.
 * User must be a participant to access.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { roomId } = await context.params;
    const room = await findRoom(roomId);

    if (!room) {
      return notFoundResponse("Ghost room not found or has expired.");
    }

    // Must be a participant
    if (!room.participants.has(userId)) {
      // Auto-join if accessing by code (for room sharing)
      if (GHOST_CODE_REGEX.test(roomId)) {
        await ephemeralStore.addParticipant(room.roomId, userId, userId);
        const updatedRoom = await ephemeralStore.getRoom(room.roomId);
        if (!updatedRoom) {
          return notFoundResponse("Ghost room not found or has expired.");
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
      return errorResponse("You are not a participant in this ghost room.", 403);
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
  } catch (error) {
    console.error("[Ghost Room GET Error]", error);
    return serverErrorResponse("Failed to retrieve ghost room.");
  }
}

// ── PATCH /api/ghost-rooms/:roomId ────────────────────────────────────

/**
 * Perform actions on a ghost room: addMessage, updateNotes, join.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { roomId } = await context.params;
    const body = await request.json();
    const { action } = body;

    if (action === "addMessage") {
      const { content } = body;
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return errorResponse("Message content is required.", 400);
      }

      // Get the room to find participant name (supports both room IDs and ghost codes)
      const room = await findRoom(roomId);
      if (!room) {
        return notFoundResponse("Ghost room not found or has expired.");
      }

      const participant = room.participants.get(userId);
      if (!participant) {
        return errorResponse("You are not a participant in this ghost room.", 403);
      }

      const message = await ephemeralStore.addMessage(roomId, {
        senderId: userId,
        senderName: participant.displayName || participant.name,
        content: content.trim(),
        timestamp: Date.now(),
        type: "text",
      });

      if (!message) {
        return errorResponse("Failed to add message.", 500);
      }

      return successResponse(message);
    }

    if (action === "updateNotes") {
      const { notes } = body;
      if (typeof notes !== "string") {
        return errorResponse("Notes must be a string.", 400);
      }

      const success = await ephemeralStore.updateNotes(roomId, notes);
      if (!success) {
        return notFoundResponse("Ghost room not found or has expired.");
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
        return notFoundResponse("Ghost room not found or has expired.");
      }

      return successResponse({ joined: true });
    }

    return errorResponse("Invalid action. Use: addMessage, updateNotes, join.", 400);
  } catch (error) {
    console.error("[Ghost Room PATCH Error]", error);
    return serverErrorResponse("Failed to update ghost room.");
  }
}

// ── DELETE /api/ghost-rooms/:roomId ───────────────────────────────────

/**
 * End/destroy a ghost room. Only the host can end it.
 * If all participants voted to save, data is persisted to MongoDB first.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { roomId } = await context.params;
    const room = await findRoom(roomId);

    if (!room) {
      return notFoundResponse("Ghost room not found or has expired.");
    }

    // Only host can end the room
    if (room.hostId !== userId) {
      return errorResponse("Only the host can end this ghost room.", 403);
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
  } catch (error) {
    console.error("[Ghost Room DELETE Error]", error);
    return serverErrorResponse("Failed to end ghost room.");
  }
}

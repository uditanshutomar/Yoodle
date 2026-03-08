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

type RouteContext = { params: Promise<{ roomId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { roomId } = await context.params;
    const room = await ephemeralStore.getRoom(roomId);

    if (!room) {
      return notFoundResponse("Ghost room not found or has expired.");
    }

    if (!room.participants.has(userId)) {
      return errorResponse("You are not a participant in this ghost room.", 403);
    }

    const participant = room.participants.get(userId);
    if (participant?.votedToSave) {
      const participantsArray = Array.from(room.participants.values());
      const consensus = checkConsensus(participantsArray);
      return successResponse({ alreadyVoted: true, votes: consensus });
    }

    const voteResult = await ephemeralStore.voteToSave(roomId, userId);
    if (!voteResult) {
      return errorResponse("Failed to cast vote.", 500);
    }

    // Re-fetch room to get updated state
    const updatedRoom = await ephemeralStore.getRoom(roomId);
    const participantsArray = updatedRoom
      ? Array.from(updatedRoom.participants.values())
      : [];
    const consensus = checkConsensus(participantsArray);

    let savedMeetingId: string | null = null;

    if (consensus.allVoted && consensus.totalParticipants > 0 && updatedRoom) {
      try {
        const result = await persistGhostData(updatedRoom);
        savedMeetingId = result.meetingId;
      } catch (err) {
        console.error("[Ghost Room Vote] Failed to persist data:", err);
      }
      await ephemeralStore.destroyRoom(roomId);
    }

    return successResponse({
      voted: true,
      votes: consensus,
      consensusReached: consensus.allVoted,
      dataSaved: savedMeetingId !== null,
      meetingId: savedMeetingId,
    });
  } catch (error) {
    console.error("[Ghost Room Vote Error]", error);
    return serverErrorResponse("Failed to process vote.");
  }
}

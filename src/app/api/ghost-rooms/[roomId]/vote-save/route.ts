import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import { checkConsensus, persistGhostData } from "@/lib/ghost/consensus";

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { roomId } = await context!.params;
  const room = await ephemeralStore.getRoom(roomId);

  if (!room) {
    throw new NotFoundError("Ghost room not found or has expired.");
  }

  if (!room.participants.has(userId)) {
    throw new ForbiddenError("You are not a participant in this ghost room.");
  }

  const participant = room.participants.get(userId);
  if (participant?.votedToSave) {
    const participantsArray = Array.from(room.participants.values());
    const consensus = checkConsensus(participantsArray);
    return successResponse({ alreadyVoted: true, votes: consensus });
  }

  const voteResult = await ephemeralStore.voteToSave(roomId, userId);
  if (!voteResult) {
    throw new Error("Failed to cast vote.");
  }

  // Re-fetch room to get updated state
  const updatedRoom = await ephemeralStore.getRoom(roomId);
  const participantsArray = updatedRoom
    ? Array.from(updatedRoom.participants.values())
    : [];
  const consensus = checkConsensus(participantsArray);

  let savedMeetingId: string | null = null;

  if (consensus.allVoted && consensus.totalParticipants > 0) {
    // Atomically claim and destroy the room — only one concurrent request
    // will succeed, preventing duplicate persistence.
    const claimedRoom = await ephemeralStore.claimAndDestroyRoom(roomId);
    if (claimedRoom) {
      try {
        const result = await persistGhostData(claimedRoom);
        savedMeetingId = result.meetingId;
      } catch (err) {
        console.error("[Ghost Room Vote] Failed to persist data:", err);
      }
    }
  }

  return successResponse({
    voted: true,
    votes: consensus,
    consensusReached: consensus.allVoted,
    dataSaved: savedMeetingId !== null,
    meetingId: savedMeetingId,
  });
});

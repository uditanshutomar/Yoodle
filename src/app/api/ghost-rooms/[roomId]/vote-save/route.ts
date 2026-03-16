import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import { checkConsensus, persistGhostData } from "@/lib/ghost/consensus";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:ghost-vote-save");

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

  // Build consensus directly from the atomic voteToSave result (which uses
  // findOneAndUpdate with { new: true }) instead of re-fetching the room.
  // Re-fetching races with claimAndDestroyRoom: if another concurrent
  // request claims (deletes) the room between our vote and our getRoom(),
  // we'd see undefined / empty participants and miss the consensus.
  const consensus = {
    voted: true,
    allVoted: voteResult.allVoted,
    totalVotes: voteResult.totalVotes,
    totalParticipants: voteResult.totalParticipants,
    percentage: voteResult.totalParticipants > 0
      ? Math.round((voteResult.totalVotes / voteResult.totalParticipants) * 100)
      : 0,
  };

  let savedMeetingId: string | null = null;
  let dataLost = false;

  if (consensus.allVoted && consensus.totalParticipants > 0) {
    // Atomically claim and destroy the room — only one concurrent request
    // will succeed, preventing duplicate persistence.
    const claimedRoom = await ephemeralStore.claimAndDestroyRoom(roomId);
    if (claimedRoom) {
      try {
        const result = await persistGhostData(claimedRoom);
        savedMeetingId = result.meetingId;
      } catch (err) {
        log.error({ err }, "failed to persist ghost room data after vote — attempting recovery");
        // Critical: the room was already deleted from the ephemeral store.
        // Try to restore it so users don't lose their data.
        try {
          await ephemeralStore.restoreRoom(claimedRoom);
          log.info({ roomId }, "successfully restored ghost room after persistence failure");
        } catch (restoreErr) {
          log.error({ restoreErr, roomId }, "CRITICAL: failed to restore ghost room — data may be lost");
          dataLost = true;
        }
      }
    }
  }

  return successResponse({
    voted: true,
    votes: consensus,
    consensusReached: consensus.allVoted,
    dataSaved: savedMeetingId !== null,
    meetingId: savedMeetingId,
    ...(dataLost && { dataLost: true }),
  });
});

import mongoose from "mongoose";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import type { GhostRoomData, GhostParticipant } from "./ephemeral-store";

// ── Types ─────────────────────────────────────────────────────────────

export interface SaveVoteResult {
  voted: boolean;
  allVoted: boolean;
  totalVotes: number;
  totalParticipants: number;
  percentage: number;
}

// ── Consensus checker ─────────────────────────────────────────────────

/**
 * Check consensus among participants.
 * Returns whether ALL participants have voted to save.
 * Accepts both Map<string, GhostParticipant> and GhostParticipant[] for flexibility.
 */
export function checkConsensus(
  participants: Map<string, Pick<GhostParticipant, "votedToSave">> | Pick<GhostParticipant, "votedToSave">[]
): SaveVoteResult {
  let totalVotes = 0;
  let totalParticipants = 0;

  const items = participants instanceof Map
    ? participants.values()
    : participants;

  for (const p of items) {
    totalParticipants++;
    if (p.votedToSave) totalVotes++;
  }

  const percentage =
    totalParticipants > 0
      ? Math.round((totalVotes / totalParticipants) * 100)
      : 0;

  return {
    voted: totalVotes > 0,
    allVoted: totalParticipants > 0 && totalVotes === totalParticipants,
    totalVotes,
    totalParticipants,
    percentage,
  };
}

// ── Persist ghost data to MongoDB ─────────────────────────────────────

/**
 * If all participants voted to save, persist the ghost room data
 * to MongoDB as a Meeting document with type "ghost".
 *
 * Returns the created meeting's ID.
 */
export async function persistGhostData(
  roomData: GhostRoomData
): Promise<{ meetingId: string }> {
  await connectDB();

  // Build participants array from the Map
  const participants = Array.from(roomData.participants.values()).map((p) => ({
    userId: new mongoose.Types.ObjectId(p.userId),
    role: p.userId === roomData.hostId ? ("host" as const) : ("participant" as const),
    joinedAt: p.joinedAt,
    status: "joined" as const,
  }));

  // Create the meeting document
  const meeting = await Meeting.create({
    code: roomData.code,
    title: roomData.title,
    description: `Ghost room saved by consensus. ${roomData.messages.length} messages, ${roomData.participants.size} participants.`,
    hostId: new mongoose.Types.ObjectId(roomData.hostId),
    participants,
    startedAt: roomData.createdAt,
    endedAt: new Date(),
    status: "ended",
    type: "ghost",
    settings: {
      maxParticipants: 25,
      allowRecording: false,
      allowScreenShare: false,
      waitingRoom: false,
      muteOnJoin: false,
    },
  });

  return { meetingId: meeting._id.toString() };
}

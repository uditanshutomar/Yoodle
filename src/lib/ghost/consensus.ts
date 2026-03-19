import mongoose from "mongoose";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { createLogger } from "@/lib/infra/logger";
import type { GhostRoomData, GhostParticipant } from "./ephemeral-store";

const log = createLogger("ghost:consensus");

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
 * Persist ghost room data after unanimous consensus.
 *
 * If the ghost room has an active call (meetingId), convert that meeting
 * from ghost → regular so recording/transcription unlock mid-call.
 * Otherwise, create a new meeting document with the chat and notes.
 */
export async function persistGhostData(
  roomData: GhostRoomData
): Promise<{ meetingId: string }> {
  await connectDB();

  try {
    const ghostMessages = roomData.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      type: m.type,
    }));

    // If a call is in progress, convert the existing meeting to regular
    if (roomData.meetingId) {
      await Meeting.updateOne(
        { _id: new mongoose.Types.ObjectId(roomData.meetingId) },
        {
          $set: {
            type: "regular",
            "settings.allowRecording": true,
            "settings.allowScreenShare": true,
            ghostMessages,
            ghostNotes: roomData.notes || undefined,
            description: `Ghost room converted by consensus. ${roomData.messages.length} messages, ${roomData.participants.size} participants.`,
          },
        },
      );
      return { meetingId: roomData.meetingId };
    }

    // No active call — create a new meeting for persistence
    const participants = Array.from(roomData.participants.values()).map((p) => ({
      userId: new mongoose.Types.ObjectId(p.userId),
      role: p.userId === roomData.hostId ? ("host" as const) : ("participant" as const),
      joinedAt: p.joinedAt,
      status: "joined" as const,
    }));

    const meeting = await Meeting.create({
      code: roomData.code,
      title: roomData.title,
      description: `Ghost room saved by consensus. ${roomData.messages.length} messages, ${roomData.participants.size} participants.`,
      hostId: new mongoose.Types.ObjectId(roomData.hostId),
      participants,
      startedAt: roomData.createdAt,
      endedAt: new Date(),
      status: "ended",
      type: "regular",
      settings: {
        maxParticipants: 25,
        allowRecording: true,
        allowScreenShare: true,
        waitingRoom: false,
        muteOnJoin: false,
      },
      ghostMessages,
      ghostNotes: roomData.notes || undefined,
    });

    return { meetingId: meeting._id.toString() };
  } catch (err) {
    log.error(
      { err, roomId: roomData.roomId },
      "Failed to persist ghost room data — room may need restoration",
    );
    throw err;
  }
}

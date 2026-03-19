import mongoose from "mongoose";
import { customAlphabet, nanoid } from "nanoid";
import connectDB from "@/lib/infra/db/client";
import GhostRoom from "@/lib/infra/db/models/ghost-room";
import type { IGhostMessage } from "@/lib/infra/db/models/ghost-room";

// ── Re-export types for backward compatibility ───────────────────────
// GhostParticipant uses string userId (converted from ObjectId in toRoomData)
export interface GhostParticipant {
  userId: string;
  name: string;
  displayName?: string;
  joinedAt: Date;
  votedToSave: boolean;
}
export type GhostMessage = IGhostMessage;

export interface GhostRoomData {
  roomId: string;
  code: string;
  title: string;
  hostId: string;
  createdAt: Date;
  participants: Map<string, GhostParticipant>;
  messages: GhostMessage[];
  notes: string;
  meetingId?: string;
  expiresAt: Date;
}

export interface GhostRoomSummary {
  roomId: string;
  title: string;
  code: string;
  participantCount: number;
  createdAt: Date;
  expiresAt: Date;
}

// ── Ghost code generator ──────────────────────────────────────────────

const GHOST_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const generateSegment = customAlphabet(GHOST_CODE_ALPHABET, 3);

function generateGhostCode(): string {
  return `ghost-${generateSegment()}-${generateSegment()}`;
}

// ── Sanitize strings to prevent XSS ───────────────────────────────────

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

// ── Default room duration: 4 hours ────────────────────────────────────

const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;

// ── Helper: convert DB document to GhostRoomData ──────────────────────

function toRoomData(doc: InstanceType<typeof GhostRoom>): GhostRoomData {
  const participants = new Map<string, GhostParticipant>();
  for (const p of doc.participants) {
    const uid = p.userId.toString();
    participants.set(uid, {
      userId: uid,
      name: p.name,
      displayName: p.displayName,
      joinedAt: p.joinedAt,
      votedToSave: p.votedToSave,
    });
  }
  return {
    roomId: doc.roomId,
    code: doc.code,
    title: doc.title,
    hostId: doc.hostId.toString(),
    createdAt: doc.createdAt,
    participants,
    messages: doc.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      type: m.type,
    })),
    notes: doc.notes,
    meetingId: doc.meetingId?.toString() || undefined,
    expiresAt: doc.expiresAt,
  };
}

// ── MongoDB-backed Ephemeral Store ────────────────────────────────────

class EphemeralStore {
  private async connect() {
    await connectDB();
  }

  // ── Create ────────────────────────────────────────────────────────

  async createRoom(
    hostId: string,
    hostName: string,
    title?: string
  ): Promise<GhostRoomData> {
    await this.connect();

    const roomId = nanoid(12);
    const code = generateGhostCode();
    const now = new Date();

    const safeName = stripHtml(hostName);
    const safeTitle = title ? stripHtml(title) : "Ghost Room";

    const hostOid = new mongoose.Types.ObjectId(hostId);
    const doc = await GhostRoom.create({
      roomId,
      code,
      title: safeTitle,
      hostId: hostOid,
      expiresAt: new Date(now.getTime() + DEFAULT_DURATION_MS),
      participants: [
        {
          userId: hostOid,
          name: safeName,
          joinedAt: now,
          votedToSave: false,
        },
      ],
      messages: [
        {
          id: nanoid(8),
          senderId: "system",
          senderName: "System",
          content: `${safeName} created the ghost room`,
          timestamp: now.getTime(),
          type: "system",
        },
      ],
      notes: "",
    });

    return toRoomData(doc);
  }

  // ── Read ──────────────────────────────────────────────────────────

  async getRoom(roomId: string): Promise<GhostRoomData | undefined> {
    await this.connect();
    const doc = await GhostRoom.findOne({
      roomId,
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return undefined;
    return toRoomData(doc);
  }

  async getRoomByCode(code: string): Promise<GhostRoomData | undefined> {
    await this.connect();
    const doc = await GhostRoom.findOne({
      code: code.toLowerCase(),
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return undefined;
    return toRoomData(doc);
  }

  // ── Participants ──────────────────────────────────────────────────

  async addParticipant(
    roomId: string,
    userId: string,
    name: string,
    displayName?: string
  ): Promise<boolean> {
    await this.connect();
    const now = new Date();
    const safeName = stripHtml(name);
    const safeDisplayName = displayName ? stripHtml(displayName) : undefined;
    const userOid = new mongoose.Types.ObjectId(userId);

    // Single atomic operation: only push if the user is NOT already present.
    // Avoids the TOCTOU race of a separate findOne + findOneAndUpdate.
    const result = await GhostRoom.findOneAndUpdate(
      {
        roomId,
        expiresAt: { $gt: now },
        "participants.userId": { $ne: userOid },
      },
      {
        $push: {
          participants: {
            userId: userOid,
            name: safeName,
            displayName: safeDisplayName,
            joinedAt: now,
            votedToSave: false,
          },
          messages: {
            id: nanoid(8),
            senderId: "system",
            senderName: "System",
            content: `${safeDisplayName || safeName} joined the ghost room`,
            timestamp: now.getTime(),
            type: "system",
          },
        },
      }
    );

    // null means either room not found OR user already present — check which.
    if (!result) {
      const exists = await GhostRoom.exists({ roomId, expiresAt: { $gt: now }, "participants.userId": userOid });
      return exists !== null; // true = already a participant
    }
    return true;
  }

  async removeParticipant(roomId: string, userId: string): Promise<void> {
    await this.connect();
    const userOid = new mongoose.Types.ObjectId(userId);

    // Single atomic operation — avoids TOCTOU race where the participant could
    // be removed between a findOne and the subsequent update.
    const doc = await GhostRoom.findOneAndUpdate(
      {
        roomId,
        expiresAt: { $gt: new Date() },
        "participants.userId": userOid,
      },
      {
        $pull: { participants: { userId: userOid } },
      },
      { returnDocument: "before" },
    );
    if (!doc) return; // Room gone or user was not a participant

    const participant = doc.participants.find((p) => p.userId.toString() === userId);
    const displayName = participant?.displayName || participant?.name || "Someone";

    // Append system message as a separate update — the participant is already
    // atomically removed above so there is no race window for duplicate removal.
    // Wrapped in try/catch since the core operation already succeeded.
    try {
      await GhostRoom.updateOne(
        { roomId },
        {
          $push: {
            messages: {
              id: nanoid(8),
              senderId: "system",
              senderName: "System",
              content: `${displayName} left the ghost room`,
              timestamp: Date.now(),
              type: "system",
            },
          },
        },
      );
    } catch (err) {
      console.warn(`[EphemeralStore] Failed to append leave message for room ${roomId}:`, err);
    }
  }

  // ── Messages ──────────────────────────────────────────────────────

  async addMessage(
    roomId: string,
    message: Omit<GhostMessage, "id">
  ): Promise<GhostMessage | undefined> {
    await this.connect();

    const fullMessage: GhostMessage = {
      ...message,
      // Strip HTML tags from message content to prevent XSS when rendered
      content: stripHtml(message.content),
      id: nanoid(8),
    };

    // Cap messages at 500 to prevent unbounded growth
    const result = await GhostRoom.findOneAndUpdate(
      { roomId, expiresAt: { $gt: new Date() } },
      { $push: { messages: { $each: [fullMessage], $slice: -500 } } }
    );

    return result ? fullMessage : undefined;
  }

  // ── Notes ─────────────────────────────────────────────────────────

  async updateNotes(roomId: string, notes: string): Promise<boolean> {
    await this.connect();
    const result = await GhostRoom.findOneAndUpdate(
      { roomId, expiresAt: { $gt: new Date() } },
      { $set: { notes } }
    );
    return result !== null;
  }

  // ── Voting ────────────────────────────────────────────────────────

  async voteToSave(
    roomId: string,
    userId: string
  ): Promise<{
    voted: boolean;
    allVoted: boolean;
    totalVotes: number;
    totalParticipants: number;
  } | null> {
    await this.connect();
    const userOid = new mongoose.Types.ObjectId(userId);

    const result = await GhostRoom.findOneAndUpdate(
      {
        roomId,
        expiresAt: { $gt: new Date() },
        "participants.userId": userOid,
      },
      { $set: { "participants.$.votedToSave": true } },
      { new: true }
    );

    if (!result) return null;

    const totalParticipants = result.participants.length;
    const totalVotes = result.participants.filter((p) => p.votedToSave).length;

    return {
      voted: true,
      allVoted: totalVotes === totalParticipants,
      totalVotes,
      totalParticipants,
    };
  }

  // ── Atomic claim & destroy (prevents double-persist race) ─────────

  /**
   * Atomically claim a room for persistence by deleting it in one operation.
   * Only succeeds if ALL participants have voted to save.
   * Returns the room data if successfully claimed, undefined otherwise.
   */
  async claimAndDestroyRoom(roomId: string): Promise<GhostRoomData | undefined> {
    await this.connect();
    const doc = await GhostRoom.findOneAndDelete({
      roomId,
      participants: { $not: { $elemMatch: { votedToSave: { $ne: true } } } },
      "participants.0": { $exists: true },
    });
    if (!doc) return undefined;
    return toRoomData(doc);
  }

  // ── Restore (recovery after failed persistence) ──────────────────

  /**
   * Re-insert a room that was claimed but failed to persist.
   * Uses the GhostRoomData structure returned by claimAndDestroyRoom.
   */
  async restoreRoom(roomData: GhostRoomData): Promise<void> {
    await this.connect();
    const participantsArray = Array.from(roomData.participants.values()).map((p) => ({
      userId: new mongoose.Types.ObjectId(p.userId),
      name: p.name,
      displayName: p.displayName,
      joinedAt: p.joinedAt,
      votedToSave: false, // Reset votes so users can re-attempt
    }));
    await GhostRoom.create({
      roomId: roomData.roomId,
      code: roomData.code,
      title: roomData.title,
      hostId: new mongoose.Types.ObjectId(roomData.hostId),
      participants: participantsArray,
      messages: roomData.messages,
      notes: roomData.notes,
      meetingId: roomData.meetingId ? new mongoose.Types.ObjectId(roomData.meetingId) : undefined,
      expiresAt: roomData.expiresAt,
    });
  }

  // ── Destroy ───────────────────────────────────────────────────────

  async destroyRoom(roomId: string): Promise<GhostRoomData | undefined> {
    await this.connect();
    const doc = await GhostRoom.findOneAndDelete({ roomId });
    if (!doc) return undefined;
    return toRoomData(doc);
  }

  // ── List active rooms ─────────────────────────────────────────────

  async getActiveRooms(): Promise<GhostRoomSummary[]> {
    await this.connect();
    const docs = await GhostRoom.find(
      { expiresAt: { $gt: new Date() } },
      { roomId: 1, title: 1, code: 1, participants: 1, createdAt: 1, expiresAt: 1 }
    ).sort({ createdAt: -1 });

    return docs.map((doc) => ({
      roomId: doc.roomId,
      title: doc.title,
      code: doc.code,
      participantCount: doc.participants.length,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
    }));
  }

  // ── Rooms for a specific user ─────────────────────────────────────

  async getRoomsForUser(userId: string): Promise<GhostRoomSummary[]> {
    await this.connect();
    const docs = await GhostRoom.find(
      {
        expiresAt: { $gt: new Date() },
        "participants.userId": new mongoose.Types.ObjectId(userId),
      },
      { roomId: 1, title: 1, code: 1, participants: 1, createdAt: 1, expiresAt: 1 }
    ).sort({ createdAt: -1 });

    return docs.map((doc) => ({
      roomId: doc.roomId,
      title: doc.title,
      code: doc.code,
      participantCount: doc.participants.length,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
    }));
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

export const ephemeralStore = new EphemeralStore();

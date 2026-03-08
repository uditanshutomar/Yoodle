import { customAlphabet, nanoid } from "nanoid";
import connectDB from "@/lib/db/client";
import GhostRoom from "@/lib/db/models/ghost-room";
import type { IGhostParticipant, IGhostMessage } from "@/lib/db/models/ghost-room";

// ── Re-export types for backward compatibility ───────────────────────

export type GhostParticipant = IGhostParticipant;
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

// ── Default room duration: 4 hours ────────────────────────────────────

const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;

// ── Helper: convert DB document to GhostRoomData ──────────────────────

function toRoomData(doc: InstanceType<typeof GhostRoom>): GhostRoomData {
  const participants = new Map<string, GhostParticipant>();
  for (const p of doc.participants) {
    participants.set(p.userId, {
      userId: p.userId,
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
    hostId: doc.hostId,
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

    const doc = await GhostRoom.create({
      roomId,
      code,
      title: title || "Ghost Room",
      hostId,
      expiresAt: new Date(now.getTime() + DEFAULT_DURATION_MS),
      participants: [
        {
          userId: hostId,
          name: hostName,
          joinedAt: now,
          votedToSave: false,
        },
      ],
      messages: [
        {
          id: nanoid(8),
          senderId: "system",
          senderName: "System",
          content: `${hostName} created the ghost room`,
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

    // Check if already participant
    const existing = await GhostRoom.findOne({
      roomId,
      expiresAt: { $gt: now },
      "participants.userId": userId,
    });
    if (existing) return true;

    const result = await GhostRoom.findOneAndUpdate(
      { roomId, expiresAt: { $gt: now } },
      {
        $push: {
          participants: {
            userId,
            name,
            displayName,
            joinedAt: now,
            votedToSave: false,
          },
          messages: {
            id: nanoid(8),
            senderId: "system",
            senderName: "System",
            content: `${displayName || name} joined the ghost room`,
            timestamp: now.getTime(),
            type: "system",
          },
        },
      }
    );
    return result !== null;
  }

  async removeParticipant(roomId: string, userId: string): Promise<void> {
    await this.connect();

    const doc = await GhostRoom.findOne({
      roomId,
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return;

    const participant = doc.participants.find((p) => p.userId === userId);
    if (!participant) return;

    await GhostRoom.findOneAndUpdate(
      { roomId },
      {
        $pull: { participants: { userId } },
        $push: {
          messages: {
            id: nanoid(8),
            senderId: "system",
            senderName: "System",
            content: `${participant.displayName || participant.name} left the ghost room`,
            timestamp: Date.now(),
            type: "system",
          },
        },
      }
    );
  }

  // ── Messages ──────────────────────────────────────────────────────

  async addMessage(
    roomId: string,
    message: Omit<GhostMessage, "id">
  ): Promise<GhostMessage | undefined> {
    await this.connect();

    const fullMessage: GhostMessage = {
      ...message,
      id: nanoid(8),
    };

    const result = await GhostRoom.findOneAndUpdate(
      { roomId, expiresAt: { $gt: new Date() } },
      { $push: { messages: fullMessage } }
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

    const result = await GhostRoom.findOneAndUpdate(
      {
        roomId,
        expiresAt: { $gt: new Date() },
        "participants.userId": userId,
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
        "participants.userId": userId,
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

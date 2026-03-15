import mongoose, { Schema, Document, Model } from "mongoose";

// ── Types ─────────────────────────────────────────────────────────────

export interface IGhostMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: "text" | "system";
}

export interface IGhostParticipant {
  userId: string;
  name: string;
  displayName?: string;
  joinedAt: Date;
  votedToSave: boolean;
}

export interface IGhostRoom extends Document {
  roomId: string;
  code: string;
  title: string;
  hostId: string;
  participants: IGhostParticipant[];
  messages: IGhostMessage[];
  notes: string;
  meetingId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ───────────────────────────────────────────────────────

const ghostMessageSchema = new Schema<IGhostMessage>(
  {
    id: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Number, required: true },
    type: { type: String, enum: ["text", "system"], default: "text" },
  },
  { _id: false }
);

const ghostParticipantSchema = new Schema<IGhostParticipant>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    displayName: { type: String },
    joinedAt: { type: Date, default: Date.now },
    votedToSave: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────

const ghostRoomSchema = new Schema<IGhostRoom>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, default: "Ghost Room" },
    hostId: { type: String, required: true },
    participants: { type: [ghostParticipantSchema], default: [] },
    messages: { type: [ghostMessageSchema], default: [] },
    notes: { type: String, default: "" },
    meetingId: { type: String },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// TTL index — MongoDB automatically deletes documents when expiresAt is reached
ghostRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── Model ─────────────────────────────────────────────────────────────

const GhostRoom: Model<IGhostRoom> =
  mongoose.models.GhostRoom ||
  mongoose.model<IGhostRoom>("GhostRoom", ghostRoomSchema);

export default GhostRoom;

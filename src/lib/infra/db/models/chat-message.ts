import mongoose, { Schema, Document, Model } from "mongoose";

// ── Types ─────────────────────────────────────────────────────────────

export interface IChatMessage {
  meetingCode: string;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: "text" | "reaction" | "system";
  timestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document {}

// ── Schema ────────────────────────────────────────────────────────────

const chatMessageSchema = new Schema<IChatMessageDocument>(
  {
    meetingCode: {
      type: String,
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "reaction", "system"],
      default: "text",
    },
    timestamp: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "chat_messages",
  }
);

// ── Indexes ───────────────────────────────────────────────────────────

// Fetch messages for a meeting in chronological order
chatMessageSchema.index({ meetingCode: 1, timestamp: 1 });

// Prevent duplicate inserts (same message sent twice)
chatMessageSchema.index({ meetingCode: 1, messageId: 1 }, { unique: true });

// ── Model ─────────────────────────────────────────────────────────────

const ChatMessage: Model<IChatMessageDocument> =
  mongoose.models.ChatMessage ||
  mongoose.model<IChatMessageDocument>("ChatMessage", chatMessageSchema);

export default ChatMessage;

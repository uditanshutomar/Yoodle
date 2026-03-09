import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const MESSAGE_TYPES = ["text", "reaction", "system"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface IChatMessage {
  meetingId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderName: string;
  content: string;
  type: MessageType;
  replyTo?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document {
  _id: Types.ObjectId;
}

const chatMessageSchema = new Schema<IChatMessageDocument>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
      enum: MESSAGE_TYPES,
      default: "text",
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "ChatMessage",
    },
  },
  {
    collection: "chat_messages",
    timestamps: true,
  }
);

chatMessageSchema.index({ meetingId: 1, createdAt: 1 });
chatMessageSchema.index({ senderId: 1, createdAt: -1 });

const ChatMessage: Model<IChatMessageDocument> =
  mongoose.models.ChatMessage ||
  mongoose.model<IChatMessageDocument>("ChatMessage", chatMessageSchema);

export default ChatMessage;

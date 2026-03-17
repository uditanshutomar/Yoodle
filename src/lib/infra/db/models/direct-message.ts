import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const MESSAGE_TYPES = ["text", "system", "agent", "agent_channel"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface IReaction {
  emoji: string;
  userId: Types.ObjectId;
  createdAt: Date;
}

export interface IDirectMessage {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: "user" | "agent";
  content: string;
  type: MessageType;
  replyTo?: Types.ObjectId;
  reactions: IReaction[];
  edited: boolean;
  editedAt?: Date;
  deleted: boolean;
  priority?: "high" | "normal";
  meetingContext?: boolean;
  agentMeta?: {
    toolCalls?: { name: string; status: string; summary?: string }[];
    actions?: { label: string; action: string; payload?: Record<string, unknown> }[];
    forUserId?: Types.ObjectId;
    pendingAction?: {
      actionId: string;
      actionType: string;
      args: Record<string, unknown>;
      summary: string;
      status: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IDirectMessageDocument extends IDirectMessage, Document {
  _id: Types.ObjectId;
}

const reactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true, maxlength: 32 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const directMessageSchema = new Schema<IDirectMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderType: { type: String, enum: ["user", "agent"], default: "user" },
    content: { type: String, required: true, maxlength: 4000 },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    replyTo: { type: Schema.Types.ObjectId, ref: "DirectMessage" },
    reactions: { type: [reactionSchema], default: [] },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date },
    deleted: { type: Boolean, default: false },
    priority: { type: String, enum: ["high", "normal"], default: "normal" },
    meetingContext: { type: Boolean },
    agentMeta: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true, collection: "direct_messages" }
);

// Paginated messages in a conversation
directMessageSchema.index({ conversationId: 1, createdAt: -1 });
// Unread count query
directMessageSchema.index({ conversationId: 1, createdAt: 1, senderId: 1 });
// Full-text search
directMessageSchema.index({ content: "text" });

const DirectMessage: Model<IDirectMessageDocument> =
  mongoose.models.DirectMessage ||
  mongoose.model<IDirectMessageDocument>("DirectMessage", directMessageSchema);

export default DirectMessage;

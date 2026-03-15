import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const CONVERSATION_TYPES = ["dm", "group"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export interface IConversationParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastReadAt?: Date;
  agentEnabled: boolean;
  muted: boolean;
  role: "admin" | "member";
}

export interface IConversation {
  type: ConversationType;
  name?: string;
  participants: IConversationParticipant[];
  pinnedMessageIds: Types.ObjectId[];
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageSenderId?: Types.ObjectId;
  meetingId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationDocument extends IConversation, Document {
  _id: Types.ObjectId;
}

const participantSchema = new Schema<IConversationParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date },
    agentEnabled: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversationDocument>(
  {
    type: { type: String, enum: CONVERSATION_TYPES, required: true },
    name: { type: String, trim: true },
    participants: { type: [participantSchema], required: true },
    pinnedMessageIds: [{ type: Schema.Types.ObjectId, ref: "DirectMessage" }],
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 100 },
    lastMessageSenderId: { type: Schema.Types.ObjectId, ref: "User" },
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "conversations" }
);

conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
conversationSchema.index(
  { type: 1, "participants.userId": 1 },
  { unique: true, partialFilterExpression: { type: "dm" } }
);

const Conversation: Model<IConversationDocument> =
  mongoose.models.Conversation ||
  mongoose.model<IConversationDocument>("Conversation", conversationSchema);

export default Conversation;

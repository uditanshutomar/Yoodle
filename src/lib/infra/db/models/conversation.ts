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
  dmPairKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Build a deterministic pair key for DM uniqueness from two user IDs. */
export function buildDmPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
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
    name: { type: String, trim: true, maxlength: 200 },
    participants: { type: [participantSchema], required: true },
    pinnedMessageIds: [{ type: Schema.Types.ObjectId, ref: "DirectMessage" }],
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 100 },
    lastMessageSenderId: { type: Schema.Types.ObjectId, ref: "User" },
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Sorted pair key for DM uniqueness (e.g. "aaa...bbb"). Set only for type=dm.
    dmPairKey: { type: String, maxlength: 100 },
  },
  { timestamps: true, collection: "conversations" }
);

conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
conversationSchema.index({ meetingId: 1 }, { sparse: true });
// DM uniqueness: use a dedicated field with sorted user IDs so that
// (A,B) and (B,A) map to the same key.  A unique partial index on this
// field prevents duplicate DM conversations reliably — unlike a compound
// index on the `participants.userId` array, which would block a user
// from appearing in more than one DM.
conversationSchema.index(
  { dmPairKey: 1 },
  { unique: true, sparse: true }
);

const Conversation: Model<IConversationDocument> =
  mongoose.models.Conversation ||
  mongoose.model<IConversationDocument>("Conversation", conversationSchema);

export default Conversation;

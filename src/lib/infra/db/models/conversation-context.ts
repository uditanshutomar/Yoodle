import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IActionItem {
  id: string;
  assignee: string;
  description: string;
  mentionedAt: Date;
  status: "open" | "done" | "stale";
  sourceMessageId?: Types.ObjectId;
}

export interface IDecision {
  description: string;
  madeAt: Date;
  participants: string[];
}

export interface IOpenQuestion {
  id: string;
  question: string;
  askedBy: string;
  askedAt: Date;
}

export interface IFact {
  content: string;
  mentionedBy: string;
  mentionedAt: Date;
}

export interface IConversationContext {
  conversationId: Types.ObjectId;
  summary: string;
  actionItems: IActionItem[];
  decisions: IDecision[];
  openQuestions: IOpenQuestion[];
  facts: IFact[];
  linkedTaskIds: Types.ObjectId[];
  linkedMeetingIds: Types.ObjectId[];
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationContextDocument
  extends IConversationContext,
    Document {
  _id: Types.ObjectId;
}

const actionItemSchema = new Schema<IActionItem>(
  {
    id: { type: String, required: true },
    assignee: { type: String, default: "unassigned" },
    description: { type: String, required: true },
    mentionedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["open", "done", "stale"],
      default: "open",
    },
    sourceMessageId: { type: Schema.Types.ObjectId, ref: "DirectMessage" },
  },
  { _id: false }
);

const decisionSchema = new Schema<IDecision>(
  {
    description: { type: String, required: true },
    madeAt: { type: Date, default: Date.now },
    participants: [{ type: String }],
  },
  { _id: false }
);

const openQuestionSchema = new Schema<IOpenQuestion>(
  {
    id: { type: String, required: true },
    question: { type: String, required: true },
    askedBy: { type: String, required: true },
    askedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const factSchema = new Schema<IFact>(
  {
    content: { type: String, required: true },
    mentionedBy: { type: String, required: true },
    mentionedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationContextSchema = new Schema<IConversationContextDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      unique: true,
      index: true,
    },
    summary: { type: String, default: "" },
    actionItems: { type: [actionItemSchema], default: [] },
    decisions: { type: [decisionSchema], default: [] },
    openQuestions: { type: [openQuestionSchema], default: [] },
    facts: { type: [factSchema], default: [] },
    linkedTaskIds: [{ type: Schema.Types.ObjectId, ref: "Task" }],
    linkedMeetingIds: [{ type: Schema.Types.ObjectId, ref: "Meeting" }],
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "conversation_contexts" }
);

const ConversationContext: Model<IConversationContextDocument> =
  mongoose.models.ConversationContext ||
  mongoose.model<IConversationContextDocument>(
    "ConversationContext",
    conversationContextSchema
  );

export default ConversationContext;

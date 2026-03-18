import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type KnowledgeNodeType =
  | "topic"
  | "decision"
  | "person_expertise"
  | "action_evolution";

export interface IKnowledgeEntry {
  meetingId: string;
  meetingTitle: string;
  date: Date;
  content: string;
  participants: string[];
}

export interface IMeetingKnowledge {
  userId: Types.ObjectId;
  nodeType: KnowledgeNodeType;
  key: string;
  entries: IKnowledgeEntry[];
  relatedKeys: string[];
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingKnowledgeDocument
  extends IMeetingKnowledge,
    Document {
  _id: Types.ObjectId;
}

const knowledgeEntrySchema = new Schema(
  {
    meetingId: { type: String, required: true },
    meetingTitle: { type: String, required: true },
    date: { type: Date, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    participants: { type: [String], default: [] },
  },
  { _id: false },
);

const meetingKnowledgeSchema = new Schema<IMeetingKnowledgeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nodeType: {
      type: String,
      enum: ["topic", "decision", "person_expertise", "action_evolution"],
      required: true,
    },
    key: { type: String, required: true, trim: true, lowercase: true },
    entries: { type: [knowledgeEntrySchema], default: [] },
    relatedKeys: { type: [String], default: [] },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "meeting_knowledge" },
);

meetingKnowledgeSchema.index(
  { userId: 1, nodeType: 1, key: 1 },
  { unique: true },
);
meetingKnowledgeSchema.index({ userId: 1, key: 1 });
meetingKnowledgeSchema.index(
  { key: "text", "entries.content": "text" },
);

const MeetingKnowledge: Model<IMeetingKnowledgeDocument> =
  mongoose.models.MeetingKnowledge ||
  mongoose.model<IMeetingKnowledgeDocument>(
    "MeetingKnowledge",
    meetingKnowledgeSchema,
  );

export default MeetingKnowledge;

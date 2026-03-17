import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const MEMORY_CATEGORIES = [
  "preference",
  "context",
  "task",
  "relationship",
  "habit",
  "project",
  "workflow",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_SOURCES = [
  "meeting",
  "chat",
  "manual",
  "inferred",
  "explicit",
] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export interface IAIMemory {
  userId: Types.ObjectId;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  confidence: number;
  relatedMeetingId?: Types.ObjectId;
  expiresAt?: Date;
  decayRate?: number;
  userExplicit?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAIMemoryDocument extends IAIMemory, Document {
  _id: Types.ObjectId;
}

const aiMemorySchema = new Schema<IAIMemoryDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: MEMORY_CATEGORIES,
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 4000,
    },
    source: {
      type: String,
      enum: MEMORY_SOURCES,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    relatedMeetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
    },
    expiresAt: {
      type: Date,
    },
    decayRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
    },
    userExplicit: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "ai_memories",
  }
);

aiMemorySchema.index({ userId: 1, category: 1 });

// TTL index: automatically delete documents when expiresAt is reached
aiMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AIMemory: Model<IAIMemoryDocument> =
  mongoose.models.AIMemory ||
  mongoose.model<IAIMemoryDocument>("AIMemory", aiMemorySchema);

export default AIMemory;

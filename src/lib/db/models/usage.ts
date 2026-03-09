import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUsage {
  userId: Types.ObjectId;
  period: string;
  participantMinutes: number;
  recordingMinutes: number;
  aiMinutes: number;
  storageBytes: number;
  livekitMinutes: number;
  p2pMinutes: number;
  lastUpdatedAt: Date;
}

export interface IUsageDocument extends IUsage, Document {
  _id: Types.ObjectId;
}

const usageSchema = new Schema<IUsageDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    period: {
      type: String,
      required: true,
    },
    participantMinutes: {
      type: Number,
      default: 0,
    },
    recordingMinutes: {
      type: Number,
      default: 0,
    },
    aiMinutes: {
      type: Number,
      default: 0,
    },
    storageBytes: {
      type: Number,
      default: 0,
    },
    livekitMinutes: {
      type: Number,
      default: 0,
    },
    p2pMinutes: {
      type: Number,
      default: 0,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "usage",
  },
);

usageSchema.index({ userId: 1, period: 1 }, { unique: true });

const Usage: Model<IUsageDocument> =
  mongoose.models.Usage ||
  mongoose.model<IUsageDocument>("Usage", usageSchema);

export default Usage;

import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const ANALYTICS_EVENT_TYPES = [
  "meeting_started",
  "meeting_ended",
  "user_joined",
  "user_left",
  "recording_started",
  "recording_stopped",
  "ai_used",
  "screen_share_started",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface IAnalyticsEvent {
  type: AnalyticsEventType;
  userId: Types.ObjectId;
  meetingId?: Types.ObjectId;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IAnalyticsEventDocument extends IAnalyticsEvent, Document {
  _id: Types.ObjectId;
}

const analyticsEventSchema = new Schema<IAnalyticsEventDocument>(
  {
    type: {
      type: String,
      required: true,
      enum: ANALYTICS_EVENT_TYPES,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

analyticsEventSchema.index({ type: 1, createdAt: -1 });
analyticsEventSchema.index({ userId: 1, createdAt: -1 });

const AnalyticsEvent: Model<IAnalyticsEventDocument> =
  mongoose.models.AnalyticsEvent ||
  mongoose.model<IAnalyticsEventDocument>(
    "AnalyticsEvent",
    analyticsEventSchema,
  );

export default AnalyticsEvent;

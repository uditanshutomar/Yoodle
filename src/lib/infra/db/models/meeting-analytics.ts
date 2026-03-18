import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const HIGHLIGHT_TYPES = [
  "decision",
  "disagreement",
  "commitment",
  "key_point",
] as const;
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number];

export interface ISpeakerStat {
  userId: string;
  name: string;
  talkTimeSeconds: number;
  talkTimePercent: number;
  wordCount: number;
  interruptionCount: number;
  sentimentAvg: number;
}

export interface IScoreBreakdown {
  agendaCoverage: number;
  decisionDensity: number;
  actionItemClarity: number;
  participationBalance: number;
}

export interface IHighlight {
  timestamp: number;
  type: HighlightType;
  text: string;
}

export interface IMeetingAnalytics {
  meetingId: Types.ObjectId;
  userId: Types.ObjectId;
  duration: number;
  participantCount: number;
  speakerStats: ISpeakerStat[];
  agendaCoverage: number;
  decisionCount: number;
  actionItemCount: number;
  actionItemsCompleted: number;
  meetingScore: number;
  scoreBreakdown: IScoreBreakdown;
  highlights: IHighlight[];
  sheetRowAppended: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingAnalyticsDocument extends IMeetingAnalytics, Document {
  _id: Types.ObjectId;
}

const speakerStatSchema = new Schema<ISpeakerStat>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    talkTimeSeconds: { type: Number, default: 0 },
    talkTimePercent: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    interruptionCount: { type: Number, default: 0 },
    sentimentAvg: { type: Number, default: 0, min: -1, max: 1 },
  },
  { _id: false },
);

const scoreBreakdownSchema = new Schema<IScoreBreakdown>(
  {
    agendaCoverage: { type: Number, default: 0 },
    decisionDensity: { type: Number, default: 0 },
    actionItemClarity: { type: Number, default: 0 },
    participationBalance: { type: Number, default: 0 },
  },
  { _id: false },
);

const highlightSchema = new Schema<IHighlight>(
  {
    timestamp: { type: Number, required: true },
    type: { type: String, enum: HIGHLIGHT_TYPES, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const meetingAnalyticsSchema = new Schema<IMeetingAnalyticsDocument>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    duration: { type: Number, default: 0 },
    participantCount: { type: Number, default: 0 },
    speakerStats: { type: [speakerStatSchema], default: [] },
    agendaCoverage: { type: Number, default: 0, min: 0, max: 100 },
    decisionCount: { type: Number, default: 0 },
    actionItemCount: { type: Number, default: 0 },
    actionItemsCompleted: { type: Number, default: 0 },
    meetingScore: { type: Number, default: 0, min: 0, max: 100 },
    scoreBreakdown: {
      type: scoreBreakdownSchema,
      default: () => ({
        agendaCoverage: 0,
        decisionDensity: 0,
        actionItemClarity: 0,
        participationBalance: 0,
      }),
    },
    highlights: { type: [highlightSchema], default: [] },
    sheetRowAppended: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "meeting_analytics" },
);

meetingAnalyticsSchema.index({ userId: 1, createdAt: -1 });

const MeetingAnalytics: Model<IMeetingAnalyticsDocument> =
  mongoose.models.MeetingAnalytics ||
  mongoose.model<IMeetingAnalyticsDocument>(
    "MeetingAnalytics",
    meetingAnalyticsSchema,
  );

export default MeetingAnalytics;

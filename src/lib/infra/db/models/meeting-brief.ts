import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const BRIEF_SOURCE_TYPES = [
  "task",
  "email_thread",
  "drive_file",
  "past_mom",
  "calendar_event",
] as const;
export type BriefSourceType = (typeof BRIEF_SOURCE_TYPES)[number];

export const BRIEF_STATUSES = ["generating", "ready", "stale"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export interface IBriefSource {
  type: BriefSourceType;
  id: string;
  title: string;
  summary: string;
  url?: string;
}

export interface ICarryoverItem {
  task: string;
  fromMeetingId: string;
  fromMeetingTitle: string;
}

export interface IMeetingBrief {
  meetingId: Types.ObjectId;
  userId: Types.ObjectId;
  googleDocId?: string;
  googleDocUrl?: string;
  sources: IBriefSource[];
  agendaSuggestions: string[];
  carryoverItems: ICarryoverItem[];
  status: BriefStatus;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingBriefDocument extends IMeetingBrief, Document {
  _id: Types.ObjectId;
}

const briefSourceSchema = new Schema<IBriefSource>(
  {
    type: {
      type: String,
      enum: BRIEF_SOURCE_TYPES,
      required: true,
    },
    id: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 1000 },
    url: { type: String },
  },
  { _id: false },
);

const carryoverItemSchema = new Schema<ICarryoverItem>(
  {
    task: { type: String, required: true },
    fromMeetingId: { type: String, required: true },
    fromMeetingTitle: { type: String, required: true },
  },
  { _id: false },
);

const meetingBriefSchema = new Schema<IMeetingBriefDocument>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    googleDocId: { type: String },
    googleDocUrl: { type: String },
    sources: { type: [briefSourceSchema], default: [] },
    agendaSuggestions: { type: [String], default: [] },
    carryoverItems: { type: [carryoverItemSchema], default: [] },
    status: {
      type: String,
      enum: BRIEF_STATUSES,
      default: "generating",
    },
    generatedAt: { type: Date },
  },
  { timestamps: true, collection: "meeting_briefs" },
);

meetingBriefSchema.index({ meetingId: 1, userId: 1 }, { unique: true });
meetingBriefSchema.index({ userId: 1, status: 1 });

const MeetingBrief: Model<IMeetingBriefDocument> =
  mongoose.models.MeetingBrief ||
  mongoose.model<IMeetingBriefDocument>("MeetingBrief", meetingBriefSchema);

export default MeetingBrief;

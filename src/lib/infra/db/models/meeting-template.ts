import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ICascadeConfig {
  createMomDoc: boolean;
  createTasks: boolean;
  sendFollowUpEmail: boolean;
  appendToSheet: boolean;
  scheduleNextMeeting: boolean;
}

export interface ITemplateMeetingSettings {
  maxParticipants?: number;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
}

export interface IMeetingTemplate {
  userId: Types.ObjectId;
  name: string;
  description?: string;
  defaultDuration: number;
  agendaSkeleton: string[];
  preMeetingChecklist: string[];
  cascadeConfig: ICascadeConfig;
  googleDocTemplateId?: string;
  meetingSettings: ITemplateMeetingSettings;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingTemplateDocument extends IMeetingTemplate, Document {
  _id: Types.ObjectId;
}

const meetingTemplateSchema = new Schema<IMeetingTemplateDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    defaultDuration: { type: Number, min: 5, max: 480, default: 30 },
    agendaSkeleton: { type: [String], default: [] },
    preMeetingChecklist: { type: [String], default: [] },
    cascadeConfig: {
      createMomDoc: { type: Boolean, default: true },
      createTasks: { type: Boolean, default: true },
      sendFollowUpEmail: { type: Boolean, default: true },
      appendToSheet: { type: Boolean, default: true },
      scheduleNextMeeting: { type: Boolean, default: false },
    },
    googleDocTemplateId: { type: String },
    meetingSettings: {
      maxParticipants: { type: Number },
      waitingRoom: { type: Boolean },
      muteOnJoin: { type: Boolean },
    },
    usageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "meeting_templates" },
);

meetingTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

const MeetingTemplate: Model<IMeetingTemplateDocument> =
  mongoose.models.MeetingTemplate ||
  mongoose.model<IMeetingTemplateDocument>(
    "MeetingTemplate",
    meetingTemplateSchema,
  );

export default MeetingTemplate;

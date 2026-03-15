import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const PARTICIPANT_ROLES = ["host", "co-host", "participant"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const PARTICIPANT_STATUSES = ["invited", "joined", "left"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const MEETING_STATUSES = [
  "scheduled",
  "live",
  "ended",
  "cancelled",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_TYPES = ["regular", "ghost"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export interface IMeetingParticipant {
  userId: Types.ObjectId;
  role: ParticipantRole;
  joinedAt?: Date;
  leftAt?: Date;
  status: ParticipantStatus;
}

export interface IMeetingSettings {
  maxParticipants: number;
  allowRecording: boolean;
  allowScreenShare: boolean;
  waitingRoom: boolean;
  muteOnJoin: boolean;
}

export interface IGhostMessageRecord {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: "text" | "system";
}

export interface IMeetingMoM {
  summary: string;
  keyDecisions: string[];
  discussionPoints: string[];
  actionItems: { task: string; owner: string; due: string }[];
  nextSteps: string[];
  generatedAt?: Date;
  generatedBy?: Types.ObjectId;
}

export interface IMeeting {
  code: string;
  title: string;
  description?: string;
  hostId: Types.ObjectId;
  participants: IMeetingParticipant[];
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  scheduledDuration?: number; // in minutes — for calendar slot tracking
  calendarEventId?: string; // Google Calendar event ID for syncing end time
  status: MeetingStatus;
  type: MeetingType;
  settings: IMeetingSettings;
  recordingId?: Types.ObjectId;
  mom?: IMeetingMoM;
  ghostMessages?: IGhostMessageRecord[];
  ghostNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingDocument extends IMeeting, Document {
  _id: Types.ObjectId;
}

const participantSchema = new Schema<IMeetingParticipant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: PARTICIPANT_ROLES,
      default: "participant",
    },
    joinedAt: {
      type: Date,
    },
    leftAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: PARTICIPANT_STATUSES,
      default: "invited",
    },
  },
  { _id: false }
);

const meetingSettingsSchema = new Schema<IMeetingSettings>(
  {
    maxParticipants: {
      type: Number,
      default: 25,
      min: 1,
    },
    allowRecording: {
      type: Boolean,
      default: false,
    },
    allowScreenShare: {
      type: Boolean,
      default: true,
    },
    waitingRoom: {
      type: Boolean,
      default: false,
    },
    muteOnJoin: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const meetingSchema = new Schema<IMeetingDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    hostId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    participants: {
      type: [participantSchema],
      default: [],
    },
    scheduledAt: {
      type: Date,
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    scheduledDuration: {
      type: Number,
      min: 5,
    },
    calendarEventId: {
      type: String,
    },
    status: {
      type: String,
      enum: MEETING_STATUSES,
      default: "scheduled",
    },
    type: {
      type: String,
      enum: MEETING_TYPES,
      default: "regular",
    },
    settings: {
      type: meetingSettingsSchema,
      default: () => ({
        maxParticipants: 25,
        allowRecording: true,
        allowScreenShare: true,
        waitingRoom: false,
        muteOnJoin: false,
      }),
    },
    recordingId: {
      type: Schema.Types.ObjectId,
      ref: "Recording",
    },
    mom: {
      type: {
        summary: { type: String, default: "" },
        keyDecisions: { type: [String], default: [] },
        discussionPoints: { type: [String], default: [] },
        actionItems: {
          type: [
            {
              task: { type: String, required: true },
              owner: { type: String, default: "Unassigned" },
              due: { type: String, default: "TBD" },
            },
          ],
          default: [],
        },
        nextSteps: { type: [String], default: [] },
        generatedAt: { type: Date },
        generatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      },
      default: undefined,
    },
    ghostMessages: {
      type: [
        {
          id: { type: String, required: true },
          senderId: { type: String, required: true },
          senderName: { type: String, required: true },
          content: { type: String, required: true },
          timestamp: { type: Number, required: true },
          type: { type: String, enum: ["text", "system"], default: "text" },
        },
      ],
      default: undefined, // Only set for ghost meetings
    },
    ghostNotes: {
      type: String,
      default: undefined, // Only set for ghost meetings
    },
  },
  {
    timestamps: true,
    collection: "meetings",
  }
);

meetingSchema.index({ status: 1, scheduledAt: 1 });
meetingSchema.index({ "participants.userId": 1 });
meetingSchema.index({ hostId: 1, status: 1, createdAt: -1 });
meetingSchema.index({ type: 1, status: 1 });

const Meeting: Model<IMeetingDocument> =
  mongoose.models.Meeting ||
  mongoose.model<IMeetingDocument>("Meeting", meetingSchema);

export default Meeting;

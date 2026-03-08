import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const PROCESSING_STATUSES = [
  "pending",
  "processing",
  "complete",
  "failed",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export interface ITranscriptSegment {
  speakerId: Types.ObjectId;
  speakerName: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface ITranscript {
  status: ProcessingStatus;
  segments: ITranscriptSegment[];
  fullText: string;
  processedAt?: Date;
}

export interface IActionItem {
  task: string;
  assignee: string;
  deadline: string;
}

export interface IAIMinutes {
  status: ProcessingStatus;
  summary: string;
  keyDecisions: string[];
  actionItems: IActionItem[];
  generatedAt?: Date;
}

export interface IRecording {
  meetingId: Types.ObjectId;
  duration: number;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  transcript: ITranscript;
  aiMinutes: IAIMinutes;
  createdAt: Date;
}

export interface IRecordingDocument extends IRecording, Document {
  _id: Types.ObjectId;
}

const transcriptSegmentSchema = new Schema<ITranscriptSegment>(
  {
    speakerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    speakerName: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    startTime: {
      type: Number,
      required: true,
    },
    endTime: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const transcriptSchema = new Schema<ITranscript>(
  {
    status: {
      type: String,
      enum: PROCESSING_STATUSES,
      default: "pending",
    },
    segments: {
      type: [transcriptSegmentSchema],
      default: [],
    },
    fullText: {
      type: String,
      default: "",
    },
    processedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const actionItemSchema = new Schema<IActionItem>(
  {
    task: {
      type: String,
      required: true,
    },
    assignee: {
      type: String,
      required: true,
    },
    deadline: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const aiMinutesSchema = new Schema<IAIMinutes>(
  {
    status: {
      type: String,
      enum: PROCESSING_STATUSES,
      default: "pending",
    },
    summary: {
      type: String,
      default: "",
    },
    keyDecisions: {
      type: [String],
      default: [],
    },
    actionItems: {
      type: [actionItemSchema],
      default: [],
    },
    generatedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const recordingSchema = new Schema<IRecordingDocument>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
    },
    transcript: {
      type: transcriptSchema,
      default: () => ({
        status: "pending",
        segments: [],
        fullText: "",
      }),
    },
    aiMinutes: {
      type: aiMinutesSchema,
      default: () => ({
        status: "pending",
        summary: "",
        keyDecisions: [],
        actionItems: [],
      }),
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "recordings",
  }
);

const Recording: Model<IRecordingDocument> =
  mongoose.models.Recording ||
  mongoose.model<IRecordingDocument>("Recording", recordingSchema);

export default Recording;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITranscriptSegment {
  speaker: string;
  speakerId: string;
  text: string;
  timestamp: number;
  duration?: number;
}

export interface ITranscript extends Document {
  meetingId: mongoose.Types.ObjectId;
  segments: ITranscriptSegment[];
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

const transcriptSegmentSchema = new Schema<ITranscriptSegment>(
  {
    speaker: { type: String, required: true },
    speakerId: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Number, required: true },
    duration: { type: Number },
  },
  { _id: false }
);

const transcriptSchema = new Schema<ITranscript>(
  {
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting", required: true, unique: true },
    segments: { type: [transcriptSegmentSchema], default: [] },
    language: { type: String, default: "en" },
  },
  { timestamps: true, collection: "transcripts" }
);

const Transcript: Model<ITranscript> =
  mongoose.models.Transcript ||
  mongoose.model<ITranscript>("Transcript", transcriptSchema);

export default Transcript;

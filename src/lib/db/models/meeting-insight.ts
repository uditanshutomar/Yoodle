import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface INextMeetingPrep {
  talkingPoints: string[];
  pendingQuestions: string[];
  unfinishedTasks: string[];
  followUpsFromLast: string[];
}

export interface IWorkSuggestion {
  suggestion: string;
  reasoning: string;
  priority: "high" | "medium" | "low";
  relatedTaskId?: Types.ObjectId;
}

export interface IWorkFlaw {
  area: string;
  issue: string;
  suggestedFix: string;
  severity: "critical" | "moderate" | "minor";
}

export interface IMeetingInsight {
  userId: Types.ObjectId;
  agentId: Types.ObjectId;
  meetingId: Types.ObjectId;
  meetingTitle: string;
  /** Extracted action items assigned to this user */
  myActionItems: string[];
  /** Decisions that affect this user */
  relevantDecisions: string[];
  /** Key takeaways personalized for this user */
  personalTakeaways: string[];
  /** What to bring up in the next meeting with these participants */
  nextMeetingPrep: INextMeetingPrep;
  /** Work suggestions based on what was discussed */
  workSuggestions: IWorkSuggestion[];
  /** Identified flaws or risks in discussed work */
  workFlaws: IWorkFlaw[];
  /** Files mentioned or relevant to this meeting */
  relatedFileIds: string[];
  /** Whether the agent has processed this meeting */
  processed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingInsightDocument extends IMeetingInsight, Document {
  _id: Types.ObjectId;
}

const nextMeetingPrepSchema = new Schema<INextMeetingPrep>(
  {
    talkingPoints: { type: [String], default: [] },
    pendingQuestions: { type: [String], default: [] },
    unfinishedTasks: { type: [String], default: [] },
    followUpsFromLast: { type: [String], default: [] },
  },
  { _id: false }
);

const workSuggestionSchema = new Schema<IWorkSuggestion>(
  {
    suggestion: { type: String, required: true },
    reasoning: { type: String, required: true },
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    relatedTaskId: { type: Schema.Types.ObjectId, ref: "AgentTask" },
  },
  { _id: false }
);

const workFlawSchema = new Schema<IWorkFlaw>(
  {
    area: { type: String, required: true },
    issue: { type: String, required: true },
    suggestedFix: { type: String, required: true },
    severity: { type: String, enum: ["critical", "moderate", "minor"], default: "moderate" },
  },
  { _id: false }
);

const meetingInsightSchema = new Schema<IMeetingInsightDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
    },
    meetingTitle: {
      type: String,
      required: true,
    },
    myActionItems: { type: [String], default: [] },
    relevantDecisions: { type: [String], default: [] },
    personalTakeaways: { type: [String], default: [] },
    nextMeetingPrep: {
      type: nextMeetingPrepSchema,
      default: () => ({
        talkingPoints: [],
        pendingQuestions: [],
        unfinishedTasks: [],
        followUpsFromLast: [],
      }),
    },
    workSuggestions: { type: [workSuggestionSchema], default: [] },
    workFlaws: { type: [workFlawSchema], default: [] },
    relatedFileIds: { type: [String], default: [] },
    processed: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "meeting_insights",
  }
);

meetingInsightSchema.index({ userId: 1, meetingId: 1 }, { unique: true });
meetingInsightSchema.index({ userId: 1, createdAt: -1 });

const MeetingInsight: Model<IMeetingInsightDocument> =
  mongoose.models.MeetingInsight ||
  mongoose.model<IMeetingInsightDocument>("MeetingInsight", meetingInsightSchema);

export default MeetingInsight;

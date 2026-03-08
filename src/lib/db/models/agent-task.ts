import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const TASK_STATUS = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_PRIORITY = ["high", "medium", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const TASK_SOURCE = [
  "meeting_transcript",
  "meeting_minutes",
  "manual",
  "agent_inferred",
  "collaboration",
] as const;
export type TaskSource = (typeof TASK_SOURCE)[number];

export interface IAgentTask {
  userId: Types.ObjectId;
  agentId: Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  /** Which meeting this task originated from */
  sourceMeetingId?: Types.ObjectId;
  /** If synced to Google Tasks */
  googleTaskId?: string;
  googleTaskListId?: string;
  /** If scheduled on Google Calendar */
  googleCalendarEventId?: string;
  /** Estimated minutes to complete */
  estimatedMinutes?: number;
  /** Scheduled work window */
  scheduledStart?: Date;
  scheduledEnd?: Date;
  /** Actual completion date */
  completedAt?: Date;
  /** Deadline from the meeting or user */
  dueDate?: Date;
  /** Who is assigned (from meeting transcript) */
  assignee?: string;
  /** Tags for categorization */
  tags: string[];
  /** Related collaboration channel if from a collab */
  collaborationChannelId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentTaskDocument extends IAgentTask, Document {
  _id: Types.ObjectId;
}

const agentTaskSchema = new Schema<IAgentTaskDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
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
    status: {
      type: String,
      enum: TASK_STATUS,
      default: "pending",
    },
    priority: {
      type: String,
      enum: TASK_PRIORITY,
      default: "medium",
    },
    source: {
      type: String,
      enum: TASK_SOURCE,
      required: true,
    },
    sourceMeetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
    },
    googleTaskId: String,
    googleTaskListId: String,
    googleCalendarEventId: String,
    estimatedMinutes: {
      type: Number,
      min: 1,
    },
    scheduledStart: Date,
    scheduledEnd: Date,
    completedAt: Date,
    dueDate: Date,
    assignee: String,
    tags: {
      type: [String],
      default: [],
    },
    collaborationChannelId: {
      type: Schema.Types.ObjectId,
      ref: "AgentChannel",
    },
  },
  {
    timestamps: true,
    collection: "agent_tasks",
  }
);

agentTaskSchema.index({ userId: 1, status: 1 });
agentTaskSchema.index({ userId: 1, sourceMeetingId: 1 });
agentTaskSchema.index({ userId: 1, dueDate: 1 });

const AgentTask: Model<IAgentTaskDocument> =
  mongoose.models.AgentTask ||
  mongoose.model<IAgentTaskDocument>("AgentTask", agentTaskSchema);

export default AgentTask;

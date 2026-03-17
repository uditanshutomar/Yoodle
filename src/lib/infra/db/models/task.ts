import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* ─── Interfaces ─── */

export interface ISubtask {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: Types.ObjectId;
}

export interface ILinkedDoc {
  googleDocId: string;
  title: string;
  url: string;
  type: "doc" | "sheet" | "slide" | "pdf" | "file";
}

export interface ILinkedEmail {
  gmailId: string;
  subject: string;
  from: string;
}

export interface ITaskSource {
  type: "manual" | "ai" | "meeting-mom" | "email" | "chat";
  sourceId?: string;
}

export interface ITask {
  boardId: Types.ObjectId;
  columnId: string;
  position: number;
  title: string;
  description?: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  creatorId: Types.ObjectId;
  assigneeId?: Types.ObjectId;
  collaborators: Types.ObjectId[];
  labels: string[];
  dueDate?: Date;
  startDate?: Date;
  subtasks: ISubtask[];
  linkedDocs: ILinkedDoc[];
  linkedEmails: ILinkedEmail[];
  meetingId?: Types.ObjectId;
  parentTaskId?: Types.ObjectId;
  source: ITaskSource;
  estimatePoints?: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaskDocument extends ITask, Document {
  _id: Types.ObjectId;
}

/* ─── Sub-schemas ─── */

const subtaskSchema = new Schema<ISubtask>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 500 },
    done: { type: Boolean, default: false },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const linkedDocSchema = new Schema<ILinkedDoc>(
  {
    googleDocId: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ["doc", "sheet", "slide", "pdf", "file"], required: true },
  },
  { _id: false },
);

const linkedEmailSchema = new Schema<ILinkedEmail>(
  {
    gmailId: { type: String, required: true },
    subject: { type: String, required: true },
    from: { type: String, required: true },
  },
  { _id: false },
);

const taskSourceSchema = new Schema<ITaskSource>(
  {
    type: { type: String, enum: ["manual", "ai", "meeting-mom", "email", "chat"], default: "manual" },
    sourceId: { type: String },
  },
  { _id: false },
);

/* ─── Main schema ─── */

const taskSchema = new Schema<ITaskDocument>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true },
    columnId: { type: String, required: true },
    position: { type: Number, required: true, default: 0 },
    title: { type: String, required: true, maxlength: 500 },
    description: { type: String, maxlength: 10000 },
    priority: { type: String, enum: ["urgent", "high", "medium", "low", "none"], default: "none" },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    collaborators: [{ type: Schema.Types.ObjectId, ref: "User" }],
    labels: [{ type: String }],
    dueDate: { type: Date },
    startDate: { type: Date },
    subtasks: { type: [subtaskSchema], default: [] },
    linkedDocs: { type: [linkedDocSchema], default: [] },
    linkedEmails: { type: [linkedEmailSchema], default: [] },
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting" },
    parentTaskId: { type: Schema.Types.ObjectId, ref: "Task" },
    source: { type: taskSourceSchema, default: { type: "manual" } },
    estimatePoints: { type: Number, min: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: "tasks" },
);

/* ─── Indexes ─── */

taskSchema.index({ boardId: 1, columnId: 1, position: 1 });
taskSchema.index({ assigneeId: 1, dueDate: 1 });
taskSchema.index({ boardId: 1, updatedAt: -1 });
taskSchema.index({ meetingId: 1 }, { sparse: true });
taskSchema.index({ parentTaskId: 1 }, { sparse: true });
taskSchema.index({ title: "text", description: "text" });

const Task: Model<ITaskDocument> =
  mongoose.models.Task || mongoose.model<ITaskDocument>("Task", taskSchema);

export default Task;

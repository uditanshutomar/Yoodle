import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITaskComment {
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  type: "comment" | "activity";
  content: string;
  changes?: {
    field: string;
    from: string;
    to: string;
  };
  createdAt: Date;
}

export interface ITaskCommentDocument extends ITaskComment, Document {
  _id: Types.ObjectId;
}

const changesSchema = new Schema(
  {
    field: { type: String, required: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
  },
  { _id: false },
);

const taskCommentSchema = new Schema<ITaskCommentDocument>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["comment", "activity"], default: "comment" },
    content: { type: String, required: true, maxlength: 4000 },
    changes: { type: changesSchema },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "task_comments" },
);

taskCommentSchema.index({ taskId: 1, createdAt: -1 });

const TaskComment: Model<ITaskCommentDocument> =
  mongoose.models.TaskComment ||
  mongoose.model<ITaskCommentDocument>("TaskComment", taskCommentSchema);

export default TaskComment;

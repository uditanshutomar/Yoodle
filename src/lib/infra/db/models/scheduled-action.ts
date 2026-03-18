import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IScheduledAction {
  userId: Types.ObjectId;
  action: string;
  args: Record<string, unknown>;
  summary: string;
  triggerAt: Date;
  status: "pending" | "fired" | "cancelled";
  firedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IScheduledActionDocument extends IScheduledAction, Document {
  _id: Types.ObjectId;
}

const scheduledActionSchema = new Schema<IScheduledActionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true, maxlength: 500 },
    triggerAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "fired", "cancelled"],
      default: "pending",
    },
    firedAt: { type: Date },
  },
  { timestamps: true, collection: "scheduled_actions" },
);

scheduledActionSchema.index({ status: 1, triggerAt: 1 });
scheduledActionSchema.index({ userId: 1, status: 1 });

const ScheduledAction: Model<IScheduledActionDocument> =
  mongoose.models.ScheduledAction ||
  mongoose.model<IScheduledActionDocument>(
    "ScheduledAction",
    scheduledActionSchema,
  );

export default ScheduledAction;

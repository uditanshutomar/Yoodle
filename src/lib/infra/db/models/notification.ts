import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "mention", "reply", "meeting_invite", "meeting_starting",
  "task_assigned", "task_due", "ai_action_complete", "ghost_room_expiring",
  "connection_request",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["urgent", "normal", "low"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_SOURCE_TYPES = ["meeting", "message", "task", "ai", "connection"] as const;
export type NotificationSourceType = (typeof NOTIFICATION_SOURCE_TYPES)[number];

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  read: boolean;
  priority: NotificationPriority;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDocument extends INotification, Document {
  _id: Types.ObjectId;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    sourceType: { type: String, enum: NOTIFICATION_SOURCE_TYPES, required: true },
    sourceId: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
    priority: { type: String, enum: NOTIFICATION_PRIORITIES, default: "normal" },
  },
  { timestamps: true },
);

// Compound index: unread notifications for a user, newest first
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// TTL index: auto-delete after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification: Model<INotificationDocument> =
  mongoose.models.Notification ||
  mongoose.model<INotificationDocument>("Notification", notificationSchema);

export default Notification;

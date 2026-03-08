import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IAuditLog {
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  userName: string;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {
  _id: Types.ObjectId;
}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    details: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "audit_logs",
  }
);

auditLogSchema.index({ workspaceId: 1, createdAt: -1 });

// TTL index: automatically delete documents 90 days after creation
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const AuditLog: Model<IAuditLogDocument> =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLogDocument>("AuditLog", auditLogSchema);

export default AuditLog;

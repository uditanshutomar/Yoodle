import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const CONNECTION_STATUSES = ["pending", "accepted", "blocked"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface IConnection {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConnectionDocument extends IConnection, Document {
  _id: Types.ObjectId;
}

const connectionSchema = new Schema<IConnectionDocument>(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: CONNECTION_STATUSES,
      default: "pending",
      required: true,
    },
  },
  { timestamps: true },
);

connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
connectionSchema.index({ recipientId: 1, status: 1 });
connectionSchema.index({ requesterId: 1, status: 1 });

const Connection: Model<IConnectionDocument> =
  mongoose.models.Connection ||
  mongoose.model<IConnectionDocument>("Connection", connectionSchema);

export default Connection;

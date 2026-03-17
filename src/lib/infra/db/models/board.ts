import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* ─── Interfaces ─── */

export interface IBoardMember {
  userId: Types.ObjectId;
  role: "owner" | "editor" | "viewer";
  joinedAt: Date;
}

export interface IBoardColumn {
  id: string;
  title: string;
  color: string;
  position: number;
  wipLimit?: number;
}

export interface IBoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface IBoard {
  title: string;
  description?: string;
  ownerId: Types.ObjectId;
  scope: "personal" | "conversation";
  conversationId?: Types.ObjectId;
  members: IBoardMember[];
  columns: IBoardColumn[];
  labels: IBoardLabel[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IBoardDocument extends IBoard, Document {
  _id: Types.ObjectId;
}

/* ─── Sub-schemas ─── */

const boardMemberSchema = new Schema<IBoardMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const boardColumnSchema = new Schema<IBoardColumn>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 },
    color: { type: String, required: true },
    position: { type: Number, required: true },
    wipLimit: { type: Number, min: 0 },
  },
  { _id: false },
);

const boardLabelSchema = new Schema<IBoardLabel>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, maxlength: 50 },
    color: { type: String, required: true },
  },
  { _id: false },
);

/* ─── Main schema ─── */

const boardSchema = new Schema<IBoardDocument>(
  {
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, enum: ["personal", "conversation"], required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", sparse: true },
    members: { type: [boardMemberSchema], default: [] },
    columns: { type: [boardColumnSchema], default: [] },
    labels: { type: [boardLabelSchema], default: [] },
  },
  { timestamps: true, collection: "boards" },
);

/* ─── Indexes ─── */

boardSchema.index({ ownerId: 1, scope: 1 });
boardSchema.index({ conversationId: 1 }, { unique: true, sparse: true });
boardSchema.index({ "members.userId": 1 });

const Board: Model<IBoardDocument> =
  mongoose.models.Board || mongoose.model<IBoardDocument>("Board", boardSchema);

export default Board;

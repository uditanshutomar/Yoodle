import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const AGENT_STATUS = ["active", "idle", "collaborating"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];

export interface IAgent {
  userId: Types.ObjectId;
  name: string;
  status: AgentStatus;
  /** Workspace scopes this agent has access to (mirrors the user's Google scopes) */
  capabilities: string[];
  /** Active collaboration channel IDs this agent is participating in */
  activeCollaborations: Types.ObjectId[];
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentDocument extends IAgent, Document {
  _id: Types.ObjectId;
}

const agentSchema = new Schema<IAgentDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      default: "Doodle",
    },
    status: {
      type: String,
      enum: AGENT_STATUS,
      default: "idle",
    },
    capabilities: {
      type: [String],
      default: [
        "chat",
        "meeting-prep",
        "meeting-minutes",
        "proofreading",
        "task-management",
        "gmail",
        "calendar",
        "drive",
        "docs",
        "sheets",
        "tasks",
        "contacts",
      ],
    },
    activeCollaborations: [
      {
        type: Schema.Types.ObjectId,
        ref: "AgentChannel",
      },
    ],
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "agents",
  }
);

const Agent: Model<IAgentDocument> =
  mongoose.models.Agent || mongoose.model<IAgentDocument>("Agent", agentSchema);

export default Agent;

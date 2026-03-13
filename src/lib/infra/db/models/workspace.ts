import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const WORKSPACE_MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];

export interface IWorkspaceMember {
  userId: Types.ObjectId;
  role: WorkspaceMemberRole;
  joinedAt: Date;
}

export interface IWorkspaceSettings {
  autoShutdown: boolean;
  shutdownAfterMinutes: number;
}

export interface IWorkspace {
  name: string;
  description?: string;
  ownerId: Types.ObjectId;
  members: IWorkspaceMember[];
  settings: IWorkspaceSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkspaceDocument extends IWorkspace, Document {
  _id: Types.ObjectId;
}

const workspaceMemberSchema = new Schema<IWorkspaceMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: WORKSPACE_MEMBER_ROLES,
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const workspaceSettingsSchema = new Schema<IWorkspaceSettings>(
  {
    autoShutdown: {
      type: Boolean,
      default: true,
    },
    shutdownAfterMinutes: {
      type: Number,
      default: 60,
      min: 5,
    },
  },
  { _id: false }
);

const workspaceSchema = new Schema<IWorkspaceDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    members: {
      type: [workspaceMemberSchema],
      default: [],
    },
    settings: {
      type: workspaceSettingsSchema,
      default: () => ({
        autoShutdown: true,
        shutdownAfterMinutes: 60,
      }),
    },
  },
  {
    timestamps: true,
    collection: "workspaces",
  }
);

workspaceSchema.index({ "members.userId": 1 });

const Workspace: Model<IWorkspaceDocument> =
  mongoose.models.Workspace ||
  mongoose.model<IWorkspaceDocument>("Workspace", workspaceSchema);

export default Workspace;

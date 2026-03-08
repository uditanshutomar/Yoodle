import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const WORKSPACE_MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];

export const VM_STATUSES = [
  "provisioning",
  "running",
  "stopped",
  "destroyed",
] as const;
export type VMStatus = (typeof VM_STATUSES)[number];

export interface IWorkspaceMember {
  userId: Types.ObjectId;
  role: WorkspaceMemberRole;
  joinedAt: Date;
}

export interface IWorkspaceVM {
  vultrInstanceId: string;
  status: VMStatus;
  region: string;
  plan: string;
  ipAddress: string;
  sshKeyId: string;
  provisionedAt?: Date;
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
  vm?: IWorkspaceVM;
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

const workspaceVMSchema = new Schema<IWorkspaceVM>(
  {
    vultrInstanceId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: VM_STATUSES,
      default: "provisioning",
    },
    region: {
      type: String,
      required: true,
    },
    plan: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    sshKeyId: {
      type: String,
      required: true,
    },
    provisionedAt: {
      type: Date,
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
    vm: {
      type: workspaceVMSchema,
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

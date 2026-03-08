export type WorkspaceMemberRole = "owner" | "admin" | "member";

export type VMStatus = "provisioning" | "running" | "stopped" | "destroyed";

export interface WorkspaceMember {
  userId: string;
  role: WorkspaceMemberRole;
  joinedAt: string;
}

export interface WorkspaceVM {
  vultrInstanceId: string;
  status: VMStatus;
  region: string;
  plan: string;
  ipAddress: string;
  sshKeyId: string;
  provisionedAt?: string;
}

export interface WorkspaceSettings {
  autoShutdown: boolean;
  shutdownAfterMinutes: number;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: WorkspaceMember[];
  vm?: WorkspaceVM;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  settings?: Partial<WorkspaceSettings>;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  settings?: Partial<WorkspaceSettings>;
}

export interface AuditLog {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface CreateAuditLogInput {
  workspaceId: string;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

import mongoose from "mongoose";
import Workspace from "@/lib/infra/db/models/workspace";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";

/**
 * Validate workspace ID format. Throws BadRequestError for invalid IDs.
 */
export function validateWorkspaceId(workspaceId: string): void {
  if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
    throw new BadRequestError("Invalid workspace ID");
  }
}

/**
 * Find a workspace by ID. Throws NotFoundError if not found.
 * Optionally restrict to specific fields via `select`.
 */
export async function findWorkspaceOrThrow(
  workspaceId: string,
  select?: string,
) {
  validateWorkspaceId(workspaceId);
  // Chain select properly — Mongoose's .select() may return a new query object
  const workspace = select
    ? await Workspace.findById(workspaceId).select(select).lean()
    : await Workspace.findById(workspaceId).lean();
  if (!workspace) throw new NotFoundError("Workspace not found.");
  return workspace;
}

/** Shape of a workspace document with members (for membership checks). */
interface WorkspaceWithMembers {
  ownerId: { toString(): string };
  members: Array<{ userId: { toString(): string }; role: string }>;
}

/**
 * Verify the user is a member (or owner) of the workspace.
 * Returns the member record, or undefined if the user is the owner
 * but not in the members array.
 */
export function verifyWorkspaceMembership(
  workspace: WorkspaceWithMembers,
  userId: string,
): { userId: { toString(): string }; role: string } | undefined {
  const member = workspace.members.find(
    (m) => m.userId.toString() === userId,
  );
  const isOwner = workspace.ownerId.toString() === userId;
  if (!member && !isOwner) {
    throw new ForbiddenError("You are not a member of this workspace.");
  }
  return member;
}

/**
 * Verify the user has admin/owner role in the workspace.
 * Throws ForbiddenError for non-admin members.
 */
export function verifyWorkspaceAdminAccess(
  workspace: WorkspaceWithMembers,
  userId: string,
  action: string,
): void {
  const member = workspace.members.find(
    (m) => m.userId.toString() === userId,
  );
  const isOwner = workspace.ownerId.toString() === userId;
  if (!isOwner && (!member || (member.role !== "owner" && member.role !== "admin"))) {
    throw new ForbiddenError(`Only owners and admins can ${action}.`);
  }
}

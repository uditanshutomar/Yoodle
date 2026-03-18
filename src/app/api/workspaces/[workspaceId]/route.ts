import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Workspace from "@/lib/infra/db/models/workspace";
import {
  findWorkspaceOrThrow,
  verifyWorkspaceMembership,
  verifyWorkspaceAdminAccess,
  validateWorkspaceId,
} from "@/lib/workspace/helpers";

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  settings: z.object({
    autoShutdown: z.boolean().optional(),
    shutdownAfterMinutes: z.number().min(1).optional(),
  }).optional(),
});

// GET /api/workspaces/[workspaceId]
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;
  await connectDB();

  const workspace = await findWorkspaceOrThrow(workspaceId);
  verifyWorkspaceMembership(workspace, userId);

  return successResponse(workspace);
});

// PATCH /api/workspaces/[workspaceId]
export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;
  const body = updateWorkspaceSchema.parse(await req.json());
  await connectDB();

  validateWorkspaceId(workspaceId);

  // Need a Mongoose document (not .lean()) for .save() which runs validators
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new NotFoundError("Workspace not found.");

  verifyWorkspaceAdminAccess(workspace, userId, "update the workspace");

  if (body.name && typeof body.name === "string") workspace.name = body.name.trim();
  if (body.description !== undefined) {
    workspace.description = typeof body.description === "string" ? body.description.trim() : "";
  }
  if (body.settings) {
    if (body.settings.autoShutdown !== undefined)
      workspace.settings.autoShutdown = body.settings.autoShutdown;
    if (body.settings.shutdownAfterMinutes !== undefined)
      workspace.settings.shutdownAfterMinutes = body.settings.shutdownAfterMinutes;
  }

  await workspace.save();
  return successResponse(workspace);
});

// DELETE /api/workspaces/[workspaceId]
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;
  await connectDB();

  const workspace = await findWorkspaceOrThrow(workspaceId, "ownerId");
  if (workspace.ownerId.toString() !== userId) {
    throw new ForbiddenError("Only the owner can delete the workspace.");
  }

  await Workspace.findByIdAndDelete(workspaceId);
  return successResponse({ deleted: true });
});

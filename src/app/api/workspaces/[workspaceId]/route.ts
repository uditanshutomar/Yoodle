import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

type RouteContext = { params: Promise<{ workspaceId: string }> };

// GET /api/workspaces/[workspaceId]
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { workspaceId } = await context.params;
    await connectDB();

    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) return notFoundResponse("Workspace not found.");

    const isMember = workspace.members.some(
      (m) => m.userId.toString() === userId
    );
    if (!isMember && workspace.ownerId.toString() !== userId) {
      return errorResponse("You are not a member of this workspace.", 403);
    }

    return successResponse(workspace);
  } catch (error) {
    console.error("[Workspace GET Error]", error);
    return serverErrorResponse("Failed to fetch workspace.");
  }
}

// PATCH /api/workspaces/[workspaceId]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { workspaceId } = await context.params;
    const body = await request.json();
    await connectDB();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return notFoundResponse("Workspace not found.");

    // Only owner or admin can update
    const member = workspace.members.find(
      (m) => m.userId.toString() === userId
    );
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return errorResponse("Only owners and admins can update the workspace.", 403);
    }

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
  } catch (error) {
    console.error("[Workspace PATCH Error]", error);
    return serverErrorResponse("Failed to update workspace.");
  }
}

// DELETE /api/workspaces/[workspaceId]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { workspaceId } = await context.params;
    await connectDB();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return notFoundResponse("Workspace not found.");

    if (workspace.ownerId.toString() !== userId) {
      return errorResponse("Only the owner can delete the workspace.", 403);
    }

    await Workspace.findByIdAndDelete(workspaceId);
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[Workspace DELETE Error]", error);
    return serverErrorResponse("Failed to delete workspace.");
  }
}

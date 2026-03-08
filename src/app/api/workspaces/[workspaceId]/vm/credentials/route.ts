import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import { getInstance } from "@/lib/vultr/client";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

export const maxDuration = 30;

type RouteContext = { params: Promise<{ workspaceId: string }> };

// GET /api/workspaces/[workspaceId]/vm/credentials
// Returns IP + root password for the workspace VM (needed for terminal SSH)
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

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return notFoundResponse("Workspace not found.");

    const isMember = workspace.members.some(
      (m) => m.userId.toString() === userId
    );
    if (!isMember) return errorResponse("Not a member.", 403);

    if (!workspace.vm?.vultrInstanceId) {
      return errorResponse("No VM provisioned.", 400);
    }

    const instance = await getInstance(workspace.vm.vultrInstanceId);

    if (instance.status !== "active") {
      return errorResponse("VM is not running. Current status: " + instance.status, 400);
    }

    return successResponse({
      ip: instance.mainIp,
      password: instance.defaultPassword,
      status: instance.status,
    });
  } catch (error) {
    console.error("[VM Credentials Error]", error);
    return serverErrorResponse("Failed to get VM credentials.");
  }
}

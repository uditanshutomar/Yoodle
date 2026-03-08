import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import AuditLog from "@/lib/db/models/audit-log";
import { provisionVM, getVMStatus, startVM, stopVM, destroyVM } from "@/lib/vultr/vm-manager";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

type RouteContext = { params: Promise<{ workspaceId: string }> };

// GET /api/workspaces/[workspaceId]/vm — get VM status
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
      return successResponse({ provisioned: false });
    }

    try {
      const status = await getVMStatus(workspace.vm.vultrInstanceId);
      return successResponse({ provisioned: true, ...status });
    } catch {
      return successResponse({
        provisioned: true,
        status: workspace.vm.status,
        ipAddress: workspace.vm.ipAddress,
      });
    }
  } catch (error) {
    console.error("[VM GET Error]", error);
    return serverErrorResponse("Failed to get VM status.");
  }
}

// POST /api/workspaces/[workspaceId]/vm — provision, start, stop, destroy
export async function POST(request: NextRequest, context: RouteContext) {
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
    const { action, region, plan } = body;

    await connectDB();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return notFoundResponse("Workspace not found.");

    const member = workspace.members.find(
      (m) => m.userId.toString() === userId
    );
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return errorResponse("Only owners and admins can manage the VM.", 403);
    }

    switch (action) {
      case "provision": {
        if (workspace.vm?.vultrInstanceId) {
          return errorResponse("VM already provisioned.", 400);
        }
        const result = await provisionVM({
          workspaceName: workspace.name,
          region,
          plan,
        });
        workspace.vm = {
          vultrInstanceId: result.instanceId,
          status: "provisioning",
          region: region || "ewr",
          plan: plan || "vc2-1c-1gb",
          ipAddress: result.ipAddress,
          sshKeyId: process.env.VULTR_SSH_KEY_ID || "",
          provisionedAt: new Date(),
        };
        await workspace.save();
        await AuditLog.create({
          workspaceId, userId, userName: "System",
          action: "vm.provision",
          details: { instanceId: result.instanceId },
        });
        return successResponse({ provisioned: true, ...result });
      }

      case "start": {
        if (!workspace.vm?.vultrInstanceId) {
          return errorResponse("No VM provisioned.", 400);
        }
        await startVM(workspace.vm.vultrInstanceId);
        workspace.vm.status = "running";
        await workspace.save();
        await AuditLog.create({
          workspaceId, userId, userName: "System",
          action: "vm.start",
        });
        return successResponse({ status: "running" });
      }

      case "stop": {
        if (!workspace.vm?.vultrInstanceId) {
          return errorResponse("No VM provisioned.", 400);
        }
        await stopVM(workspace.vm.vultrInstanceId);
        workspace.vm.status = "stopped";
        await workspace.save();
        await AuditLog.create({
          workspaceId, userId, userName: "System",
          action: "vm.stop",
        });
        return successResponse({ status: "stopped" });
      }

      case "destroy": {
        if (!workspace.vm?.vultrInstanceId) {
          return errorResponse("No VM provisioned.", 400);
        }
        await destroyVM(workspace.vm.vultrInstanceId);
        workspace.vm.status = "destroyed";
        workspace.vm = undefined;
        await workspace.save();
        await AuditLog.create({
          workspaceId, userId, userName: "System",
          action: "vm.destroy",
        });
        return successResponse({ status: "destroyed" });
      }

      default:
        return errorResponse("Invalid action. Use: provision, start, stop, destroy.", 400);
    }
  } catch (error) {
    console.error("[VM POST Error]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return serverErrorResponse(`Failed to manage VM: ${message}`);
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import User from "@/lib/db/models/user";
import AuditLog from "@/lib/db/models/audit-log";
import { provisionVM, getVMStatus, startVM, stopVM, destroyVM } from "@/lib/vultr/vm-manager";

// Map Vultr instance statuses to our app-level VM statuses
function mapVultrStatus(vultrStatus: string): "provisioning" | "running" | "stopped" | "destroyed" {
  switch (vultrStatus) {
    case "active":
      return "running";
    case "halted":
    case "stopped":
      return "stopped";
    case "pending":
    case "installing":
      return "provisioning";
    default:
      return "provisioning";
  }
}

// Extend Vercel serverless function timeout (default 10s is too short for cold start + Vultr API)
export const maxDuration = 30;

const vmActionSchema = z.object({
  action: z.enum(["provision", "start", "stop", "destroy"]),
  region: z.string().optional(),
  plan: z.string().optional(),
});

// GET /api/workspaces/[workspaceId]/vm -- get VM status
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { workspaceId } = await context!.params;
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  await connectDB();

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new NotFoundError("Workspace not found.");

  const isMember = workspace.members.some(
    (m) => m.userId.toString() === userId
  );
  if (!isMember) throw new ForbiddenError("Not a member.");

  if (!workspace.vm?.vultrInstanceId) {
    return successResponse({ provisioned: false });
  }

  try {
    const status = await getVMStatus(workspace.vm.vultrInstanceId);

    // Sync Vultr status back to DB so the workspace reflects reality
    const mappedStatus = mapVultrStatus(status.status);
    if (workspace.vm.status !== mappedStatus || workspace.vm.ipAddress !== status.ipAddress) {
      workspace.vm.status = mappedStatus;
      if (status.ipAddress && status.ipAddress !== "0.0.0.0") {
        workspace.vm.ipAddress = status.ipAddress;
      }
      await workspace.save();
    }

    return successResponse({ provisioned: true, ...status, appStatus: mappedStatus });
  } catch {
    return successResponse({
      provisioned: true,
      status: workspace.vm.status,
      ipAddress: workspace.vm.ipAddress,
    });
  }
});

// POST /api/workspaces/[workspaceId]/vm -- provision, start, stop, destroy
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { workspaceId } = await context!.params;
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  const body = vmActionSchema.parse(await req.json());
  const { action, region, plan } = body;

  console.log("[VM POST] action:", action, "workspaceId:", workspaceId);

  await connectDB();

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new NotFoundError("Workspace not found.");

  const member = workspace.members.find(
    (m) => m.userId.toString() === userId
  );
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new ForbiddenError("Only owners and admins can manage the VM.");
  }

  // Look up the acting user's name for audit logs
  const actingUser = await User.findById(userId).select("name displayName").lean();
  const actingUserName = actingUser?.displayName || actingUser?.name || "Unknown";

  switch (action) {
    case "provision": {
      if (workspace.vm?.vultrInstanceId) {
        throw new BadRequestError("VM already provisioned.");
      }

      console.log("[VM] Calling Vultr API to provision...");
      const result = await provisionVM({
        workspaceName: workspace.name,
        region,
        plan,
      });
      console.log("[VM] Vultr returned instanceId:", result.instanceId);

      const sshKeyId = process.env.VULTR_SSH_KEY_ID || "";
      console.log("[VM] sshKeyId length:", sshKeyId.length);

      workspace.vm = {
        vultrInstanceId: result.instanceId,
        status: "provisioning",
        region: region || "ewr",
        plan: plan || "vc2-1c-1gb",
        ipAddress: result.ipAddress || "0.0.0.0",
        sshKeyId,
        provisionedAt: new Date(),
      };

      console.log("[VM] Saving workspace...");
      await workspace.save();
      console.log("[VM] Workspace saved. Creating audit log...");

      await AuditLog.create({
        workspaceId, userId, userName: actingUserName,
        action: "vm.provision",
        details: { instanceId: result.instanceId },
      });
      console.log("[VM] Provision complete");

      return successResponse({ provisioned: true, ...result });
    }

    case "start": {
      if (!workspace.vm?.vultrInstanceId) {
        throw new BadRequestError("No VM provisioned.");
      }
      await startVM(workspace.vm.vultrInstanceId);
      // Don't set "running" immediately — the VM needs time to boot.
      // Set "provisioning" and let the GET polling sync the real status from Vultr.
      workspace.vm.status = "provisioning";
      await workspace.save();
      await AuditLog.create({
        workspaceId, userId, userName: actingUserName,
        action: "vm.start",
      });
      return successResponse({ status: "running" });
    }

    case "stop": {
      if (!workspace.vm?.vultrInstanceId) {
        throw new BadRequestError("No VM provisioned.");
      }
      await stopVM(workspace.vm.vultrInstanceId);
      workspace.vm.status = "stopped";
      await workspace.save();
      await AuditLog.create({
        workspaceId, userId, userName: actingUserName,
        action: "vm.stop",
      });
      return successResponse({ status: "stopped" });
    }

    case "destroy": {
      if (!workspace.vm?.vultrInstanceId) {
        throw new BadRequestError("No VM provisioned.");
      }
      await destroyVM(workspace.vm.vultrInstanceId);
      workspace.vm = undefined;
      await workspace.save();
      await AuditLog.create({
        workspaceId, userId, userName: actingUserName,
        action: "vm.destroy",
      });
      return successResponse({ status: "destroyed" });
    }
  }
});

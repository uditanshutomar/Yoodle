import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import { getInstance } from "@/lib/vultr/client";

export const maxDuration = 30;

// GET /api/workspaces/[workspaceId]/vm/credentials
// Returns IP + root password for the workspace VM (needed for terminal SSH)
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
    throw new BadRequestError("No VM provisioned.");
  }

  const instance = await getInstance(workspace.vm.vultrInstanceId);

  if (instance.status !== "active") {
    throw new BadRequestError("VM is not running. Current status: " + instance.status);
  }

  return successResponse({
    ip: instance.mainIp,
    password: instance.defaultPassword,
    status: instance.status,
  });
});

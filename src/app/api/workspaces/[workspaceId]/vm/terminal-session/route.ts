import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { signTerminalSessionToken } from "@/lib/auth/service-session";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { workspaceId } = await context!.params;
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  await connectDB();

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    throw new NotFoundError("Workspace not found.");
  }

  const isMember =
    workspace.ownerId.toString() === userId ||
    workspace.members.some((m) => m.userId.toString() === userId);
  if (!isMember) {
    throw new ForbiddenError("Not a member.");
  }

  if (!workspace.vm?.vultrInstanceId) {
    throw new BadRequestError("No VM provisioned.");
  }

  if (!workspace.vm.ipAddress || workspace.vm.status !== "running") {
    throw new BadRequestError("VM is not running.");
  }

  const token = await signTerminalSessionToken(userId, workspaceId);

  return successResponse({
    token,
    workspaceId,
    host: workspace.vm.ipAddress,
  });
});

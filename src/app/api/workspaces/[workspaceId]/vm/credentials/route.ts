import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
export const maxDuration = 30;

// GET /api/workspaces/[workspaceId]/vm/credentials
// Legacy endpoint intentionally no longer exposes raw VM credentials.
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

  void req;

  throw new ForbiddenError(
    "Direct VM credentials are no longer exposed. Use /api/workspaces/[workspaceId]/vm/terminal-session instead.",
  );
});

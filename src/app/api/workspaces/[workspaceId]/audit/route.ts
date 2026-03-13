import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Workspace from "@/lib/infra/db/models/workspace";
import AuditLog from "@/lib/infra/db/models/audit-log";

// GET /api/workspaces/[workspaceId]/audit
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { workspaceId } = await context!.params;
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);

  await connectDB();

  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw new NotFoundError("Workspace not found.");

  const isMember = workspace.members.some(
    (m) => m.userId.toString() === userId
  );
  if (!isMember && workspace.ownerId.toString() !== userId) {
    throw new ForbiddenError("Not a member.");
  }

  const [logs, total] = await Promise.all([
    AuditLog.find({ workspaceId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments({ workspaceId }),
  ]);

  return successResponse({
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

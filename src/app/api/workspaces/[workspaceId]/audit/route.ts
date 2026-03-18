import { NextRequest } from "next/server";
import mongoose from "mongoose";
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

  const workspace = await Workspace.findById(workspaceId).select("ownerId members").lean();
  if (!workspace) throw new NotFoundError("Workspace not found.");

  const member = workspace.members.find(
    (m: { userId: { toString: () => string }; role: string }) =>
      m.userId.toString() === userId
  );
  const isOwner = workspace.ownerId.toString() === userId;
  if (!isOwner && (!member || (member.role !== "owner" && member.role !== "admin"))) {
    throw new ForbiddenError("Only owners and admins can view audit logs.");
  }

  const [logs, total] = await Promise.all([
    AuditLog.find({ workspaceId: new mongoose.Types.ObjectId(workspaceId) })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments({ workspaceId: new mongoose.Types.ObjectId(workspaceId) }),
  ]);

  return successResponse({
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

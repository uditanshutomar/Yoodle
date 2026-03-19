import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import AuditLog from "@/lib/infra/db/models/audit-log";
import {
  findWorkspaceOrThrow,
  verifyWorkspaceAdminAccess,
} from "@/lib/workspace/helpers";

// GET /api/workspaces/[workspaceId]/audit
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);

  await connectDB();

  const workspace = await findWorkspaceOrThrow(workspaceId, "ownerId members");
  verifyWorkspaceAdminAccess(workspace, userId, "view audit logs");

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

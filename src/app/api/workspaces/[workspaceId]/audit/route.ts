import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import AuditLog from "@/lib/db/models/audit-log";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

type RouteContext = { params: Promise<{ workspaceId: string }> };

// GET /api/workspaces/[workspaceId]/audit
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
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);

    await connectDB();

    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) return notFoundResponse("Workspace not found.");

    const isMember = workspace.members.some(
      (m) => m.userId.toString() === userId
    );
    if (!isMember && workspace.ownerId.toString() !== userId) {
      return errorResponse("Not a member.", 403);
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
  } catch (error) {
    console.error("[Audit GET Error]", error);
    return serverErrorResponse("Failed to fetch audit logs.");
  }
}

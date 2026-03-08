import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import User from "@/lib/db/models/user";
import AuditLog from "@/lib/db/models/audit-log";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

type RouteContext = { params: Promise<{ workspaceId: string }> };

// GET — list members
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

    const workspace = await Workspace.findById(workspaceId)
      .populate("members.userId", "name email displayName")
      .lean();

    if (!workspace) return notFoundResponse("Workspace not found.");

    const isMember = workspace.members.some(
      (m) => m.userId?.toString() === userId || (m.userId as unknown as { _id: string })?._id?.toString() === userId
    );
    if (!isMember) return errorResponse("Not a member.", 403);

    return successResponse(workspace.members);
  } catch (error) {
    console.error("[Members GET Error]", error);
    return serverErrorResponse("Failed to fetch members.");
  }
}

// POST — add a member by email
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
    const { email, role = "member" } = body;

    if (!email) return errorResponse("Email is required.", 400);
    if (!["member", "admin"].includes(role)) {
      return errorResponse("Role must be 'member' or 'admin'.", 400);
    }

    await connectDB();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return notFoundResponse("Workspace not found.");

    const member = workspace.members.find(
      (m) => m.userId.toString() === userId
    );
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return errorResponse("Only owners and admins can add members.", 403);
    }

    const userToAdd = await User.findOne({ email: email.toLowerCase() });
    if (!userToAdd) return notFoundResponse("User not found with that email.");

    const alreadyMember = workspace.members.some(
      (m) => m.userId.toString() === userToAdd._id.toString()
    );
    if (alreadyMember) return errorResponse("User is already a member.", 400);

    workspace.members.push({
      userId: userToAdd._id,
      role,
      joinedAt: new Date(),
    });

    await workspace.save();
    await AuditLog.create({
      workspaceId, userId, userName: "System",
      action: "member.add",
      details: { addedUserId: userToAdd._id, email, role },
    });

    return successResponse({ added: true, memberId: userToAdd._id });
  } catch (error) {
    console.error("[Members POST Error]", error);
    return serverErrorResponse("Failed to add member.");
  }
}

// DELETE — remove a member
export async function DELETE(request: NextRequest, context: RouteContext) {
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
    const memberId = searchParams.get("memberId");

    if (!memberId) return errorResponse("memberId is required.", 400);

    await connectDB();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return notFoundResponse("Workspace not found.");

    const requester = workspace.members.find(
      (m) => m.userId.toString() === userId
    );
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
      return errorResponse("Only owners and admins can remove members.", 403);
    }

    if (workspace.ownerId.toString() === memberId) {
      return errorResponse("Cannot remove the workspace owner.", 400);
    }

    workspace.members = workspace.members.filter(
      (m) => m.userId.toString() !== memberId
    );

    await workspace.save();
    await AuditLog.create({
      workspaceId, userId, userName: "System",
      action: "member.remove",
      details: { removedUserId: memberId },
    });

    return successResponse({ removed: true });
  } catch (error) {
    console.error("[Members DELETE Error]", error);
    return serverErrorResponse("Failed to remove member.");
  }
}

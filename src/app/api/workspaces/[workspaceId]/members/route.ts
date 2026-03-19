import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Workspace from "@/lib/infra/db/models/workspace";
import User from "@/lib/infra/db/models/user";
import AuditLog from "@/lib/infra/db/models/audit-log";
import { createLogger } from "@/lib/infra/logger";
import {
  findWorkspaceOrThrow,
  verifyWorkspaceAdminAccess,
  validateWorkspaceId,
} from "@/lib/workspace/helpers";

const log = createLogger("workspaces:members");

const addMemberSchema = z.object({
  email: z.string().email("Valid email is required."),
  role: z.enum(["member", "admin"]).optional().default("member"),
});

// GET -- list members
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;
  validateWorkspaceId(workspaceId);
  await connectDB();

  const workspace = await Workspace.findById(workspaceId)
    .populate("members.userId", "name displayName")
    .lean();

  if (!workspace) throw new NotFoundError("Workspace not found.");

  // Check membership — handle both populated (object with _id) and unpopulated (ObjectId) userId
  const isMember = workspace.members.some((m) => {
    const uid = m.userId as unknown;
    const mUserId = typeof uid === "object" && uid !== null && "_id" in uid
      ? (uid as { _id: { toString(): string } })._id.toString()
      : String(uid);
    return mUserId === userId;
  });
  if (!isMember) throw new NotFoundError("Workspace not found.");

  return successResponse(workspace.members);
});

// POST -- add a member by email
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;
  const body = addMemberSchema.parse(await req.json());
  const { email, role } = body;
  await connectDB();

  const workspace = await findWorkspaceOrThrow(workspaceId, "ownerId members");
  verifyWorkspaceAdminAccess(workspace, userId, "add members");

  const userToAdd = await User.findOne({ email: email.toLowerCase() }).select("_id").lean();
  if (!userToAdd) throw new NotFoundError("User not found with that email.");

  const alreadyMember = workspace.members.some(
    (m) => m.userId.toString() === userToAdd._id.toString()
  );
  if (alreadyMember) throw new BadRequestError("User is already a member.");

  // Atomic push — guards against duplicate if concurrent requests pass
  // the alreadyMember check simultaneously
  const updated = await Workspace.findOneAndUpdate(
    {
      _id: workspaceId,
      "members.userId": { $ne: userToAdd._id },
    },
    {
      $push: {
        members: { userId: userToAdd._id, role, joinedAt: new Date() },
      },
    },
    { new: true },
  );

  if (!updated) {
    throw new BadRequestError("User is already a member (concurrent add).");
  }

  // Audit log is best-effort — don't fail the response if it errors
  try {
    const actingUser = await User.findById(userId).select("name displayName").lean();
    const actingUserName = actingUser?.displayName || actingUser?.name || "Unknown";
    await AuditLog.create({
      workspaceId, userId, userName: actingUserName,
      action: "member.add",
      details: { addedUserId: userToAdd._id, email, role },
    });
  } catch (err) {
    log.warn({ err, workspaceId, addedUserId: userToAdd._id.toString() }, "failed to create audit log for member add");
  }

  return successResponse({ added: true, memberId: userToAdd._id });
});

// DELETE -- remove a member
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { workspaceId } = await context!.params;
  await connectDB();

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("memberId");

  if (!memberId) throw new BadRequestError("memberId is required.");
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    throw new BadRequestError("Invalid member ID");
  }

  const workspace = await findWorkspaceOrThrow(workspaceId, "ownerId members");
  verifyWorkspaceAdminAccess(workspace, userId, "remove members");

  if (workspace.ownerId.toString() === memberId) {
    throw new BadRequestError("Cannot remove the workspace owner.");
  }

  // Atomic pull — prevents race if concurrent remove requests both pass the check
  const updated = await Workspace.findOneAndUpdate(
    { _id: workspaceId, "members.userId": memberId },
    { $pull: { members: { userId: memberId } } },
    { new: true },
  );

  if (!updated) {
    throw new BadRequestError("Member not found or already removed.");
  }

  // Audit log is best-effort — don't fail the response if it errors
  try {
    const actingUser = await User.findById(userId).select("name displayName").lean();
    const actingUserName = actingUser?.displayName || actingUser?.name || "Unknown";
    await AuditLog.create({
      workspaceId, userId, userName: actingUserName,
      action: "member.remove",
      details: { removedUserId: memberId },
    });
  } catch (err) {
    log.warn({ err, workspaceId, removedUserId: memberId }, "failed to create audit log for member remove");
  }

  return successResponse({ removed: true });
});

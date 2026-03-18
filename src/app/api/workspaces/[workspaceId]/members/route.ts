import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Workspace from "@/lib/infra/db/models/workspace";
import User from "@/lib/infra/db/models/user";
import AuditLog from "@/lib/infra/db/models/audit-log";
import { createLogger } from "@/lib/infra/logger";

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
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  await connectDB();

  const workspace = await Workspace.findById(workspaceId)
    .populate("members.userId", "name email displayName")
    .lean();

  if (!workspace) throw new NotFoundError("Workspace not found.");

  const isMember = workspace.members.some(
    (m) => m.userId?.toString() === userId || (m.userId as unknown as { _id: string })?._id?.toString() === userId
  );
  if (!isMember) throw new ForbiddenError("Not a member.");

  return successResponse(workspace.members);
});

// POST -- add a member by email
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { workspaceId } = await context!.params;
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  const body = addMemberSchema.parse(await req.json());
  const { email, role } = body;

  await connectDB();

  const workspace = await Workspace.findById(workspaceId).select("members").lean();
  if (!workspace) throw new NotFoundError("Workspace not found.");

  const member = workspace.members.find(
    (m) => m.userId.toString() === userId
  );
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new ForbiddenError("Only owners and admins can add members.");
  }

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
  if (!workspaceId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid workspace ID");
  }

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("memberId");

  if (!memberId) throw new BadRequestError("memberId is required.");
  if (!memberId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid member ID");
  }

  await connectDB();

  const workspace = await Workspace.findById(workspaceId).select("ownerId members").lean();
  if (!workspace) throw new NotFoundError("Workspace not found.");

  const requester = workspace.members.find(
    (m) => m.userId.toString() === userId
  );
  if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
    throw new ForbiddenError("Only owners and admins can remove members.");
  }

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

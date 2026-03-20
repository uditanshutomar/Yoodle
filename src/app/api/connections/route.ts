import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";

import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Connection from "@/lib/infra/db/models/connection";
import User from "@/lib/infra/db/models/user";
import Notification from "@/lib/infra/db/models/notification";

// ─── Schemas ────────────────────────────────────────────────────────

const postBodySchema = z.object({
  email: z.string().email("Invalid email address"),
});

const statusParamSchema = z.enum(["pending", "accepted", "blocked"]).default("accepted");

// ─── POST /api/connections — send a connection request ──────────────

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const body = await req.json();
  const { email } = postBodySchema.parse(body);

  // Look up target user
  const targetUser = await User.findOne({ email }).select("_id").lean();
  if (!targetUser) {
    throw new NotFoundError("User not found");
  }

  const recipientId = targetUser._id.toString();

  // Prevent self-request
  if (recipientId === userId) {
    throw new BadRequestError("Cannot send a connection request to yourself");
  }

  // Check for existing connection in either direction
  const existing = await Connection.findOne({
    $or: [
      { requesterId: new mongoose.Types.ObjectId(userId), recipientId: new mongoose.Types.ObjectId(recipientId) },
      { requesterId: new mongoose.Types.ObjectId(recipientId), recipientId: new mongoose.Types.ObjectId(userId) },
    ],
  }).lean();

  if (existing) {
    if (existing.status === "blocked") {
      throw new ForbiddenError("Cannot send connection request");
    }
    throw new ConflictError("Connection already exists");
  }

  // Create the connection
  const connection = await Connection.create({
    requesterId: new mongoose.Types.ObjectId(userId),
    recipientId: new mongoose.Types.ObjectId(recipientId),
    status: "pending",
  });

  // Get requester name for notification
  const requester = await User.findById(userId).select("name").lean();
  const requesterName = requester?.name ?? "Someone";

  // Create notification for recipient
  await Notification.create({
    userId: new mongoose.Types.ObjectId(recipientId),
    type: "connection_request",
    title: "New connection request",
    body: `${requesterName} wants to connect with you`,
    sourceType: "connection",
    sourceId: connection._id.toString(),
    priority: "normal",
  });

  return successResponse(
    {
      id: connection._id.toString(),
      recipientId,
      status: connection.status,
    },
    201,
  );
});

// ─── GET /api/connections — list connections ────────────────────────

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const url = new URL(req.url);
  const status = statusParamSchema.parse(url.searchParams.get("status") ?? undefined);

  const userOid = new mongoose.Types.ObjectId(userId);

  const connections = await Connection.find({
    $or: [{ requesterId: userOid }, { recipientId: userOid }],
    status,
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  // Collect "other" user IDs
  const otherUserIds = connections.map((c) =>
    c.requesterId.toString() === userId ? c.recipientId : c.requesterId,
  );

  // Batch-fetch other users
  const users = await User.find({ _id: { $in: otherUserIds } })
    .select("name displayName avatarUrl status mode")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const results = connections.map((c) => {
    const isRequester = c.requesterId.toString() === userId;
    const otherUserId = isRequester ? c.recipientId : c.requesterId;
    const otherUser = userMap.get(otherUserId.toString());

    return {
      id: c._id.toString(),
      userId: otherUserId.toString(),
      name: otherUser?.name ?? null,
      displayName: otherUser?.displayName ?? null,
      avatarUrl: otherUser?.avatarUrl ?? null,
      userStatus: otherUser?.status ?? null,
      mode: otherUser?.mode ?? null,
      connectionStatus: c.status,
      direction: isRequester ? ("sent" as const) : ("received" as const),
      createdAt: c.createdAt.toISOString(),
    };
  });

  return successResponse(results);
});

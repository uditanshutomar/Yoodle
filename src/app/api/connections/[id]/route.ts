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
  ForbiddenError,
} from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Connection from "@/lib/infra/db/models/connection";

// ─── Schemas ────────────────────────────────────────────────────────

const patchBodySchema = z.object({
  action: z.enum(["accept", "block"]),
});

// ─── PATCH /api/connections/[id] — accept or block a pending request ─

export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid connection ID.");
  }

  const body = await req.json();
  const { action } = patchBodySchema.parse(body);

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Atomic update: only the recipient can accept/block, and only pending connections
  const updated = await Connection.findOneAndUpdate(
    { _id: id, recipientId: userObjectId, status: "pending" },
    { status: action === "accept" ? "accepted" : "blocked" },
    { new: true },
  ).lean();

  if (!updated) {
    throw new NotFoundError("Connection request not found.");
  }

  return successResponse({
    id: updated._id.toString(),
    status: updated.status,
  });
});

// ─── DELETE /api/connections/[id] — cancel or remove a connection ────

export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid connection ID.");
  }

  const connection = await Connection.findById(id).lean();

  if (!connection) {
    throw new NotFoundError("Connection not found.");
  }

  const isRequester = connection.requesterId.toString() === userId;
  const isRecipient = connection.recipientId.toString() === userId;

  if (!isRequester && !isRecipient) {
    throw new NotFoundError("Connection not found.");
  }

  // If pending and user is recipient, they should use PATCH instead
  if (connection.status === "pending" && isRecipient) {
    throw new ForbiddenError(
      "Only the sender can cancel. Use PATCH to accept/block.",
    );
  }

  await Connection.findOneAndDelete({ _id: id }).lean();

  return successResponse({ removed: true });
});

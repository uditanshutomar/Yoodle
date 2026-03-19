import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { BadRequestError, ConflictError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Conversation from "@/lib/infra/db/models/conversation";
import { generateDefaultColumns, generateDefaultLabels } from "@/lib/board/helpers";

/* ─── Validation ─── */

const createBoardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scope: z.enum(["personal", "conversation"]),
  conversationId: z.string().optional(),
});

/* ─── GET /api/boards ─── */

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const boards = await Board.find({
    $or: [
      { ownerId: userOid },
      { "members.userId": userOid },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  return successResponse(boards);
});

/* ─── POST /api/boards ─── */

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const body = createBoardSchema.parse(await req.json());
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Personal boards: limit 1 per user
  if (body.scope === "personal") {
    const existing = await Board.findOne({ ownerId: userOid, scope: "personal" }).select("_id").lean();
    if (existing) throw new ConflictError("You already have a personal board");
  }

  // Conversation boards: require valid conversationId + verify membership
  if (body.scope === "conversation" && !body.conversationId) {
    throw new BadRequestError("conversationId required for conversation boards");
  }
  if (body.conversationId && !mongoose.Types.ObjectId.isValid(body.conversationId)) {
    throw new BadRequestError("Invalid conversationId format");
  }
  if (body.scope === "conversation" && body.conversationId) {
    const conv = await Conversation.findOne({
      _id: new mongoose.Types.ObjectId(body.conversationId),
      "participants.userId": userOid,
    }).select("_id").lean();
    if (!conv) {
      throw new ForbiddenError("You are not a participant in this conversation.");
    }
  }

  let board;
  try {
    board = await Board.create({
      title: body.title,
      description: body.description,
      ownerId: userOid,
      scope: body.scope,
      conversationId: body.conversationId
        ? new mongoose.Types.ObjectId(body.conversationId)
        : undefined,
      members: [{ userId: userOid, role: "owner", joinedAt: new Date() }],
      columns: generateDefaultColumns(),
      labels: generateDefaultLabels(),
    });
  } catch (err) {
    // Handle race condition: concurrent personal board creation triggers E11000
    if (
      body.scope === "personal" &&
      err instanceof Error &&
      "code" in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError("You already have a personal board");
    }
    throw err;
  }

  return successResponse(board, 201);
});

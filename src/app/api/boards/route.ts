import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, badRequest } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
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
    const existing = await Board.findOne({ ownerId: userOid, scope: "personal" });
    if (existing) return badRequest("You already have a personal board");
  }

  // Conversation boards: require valid conversationId
  if (body.scope === "conversation" && !body.conversationId) {
    return badRequest("conversationId required for conversation boards");
  }
  if (body.conversationId && !mongoose.Types.ObjectId.isValid(body.conversationId)) {
    return badRequest("Invalid conversationId format");
  }

  const board = await Board.create({
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

  return successResponse(board, 201);
});

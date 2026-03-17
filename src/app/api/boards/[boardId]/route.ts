import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, badRequest } from "@/lib/infra/api/response";
import { NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";

/* ─── Validation ─── */

const updateBoardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  columns: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(100),
        color: z.string(),
        position: z.number(),
        wipLimit: z.number().min(0).optional(),
      }),
    )
    .optional(),
  labels: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50),
        color: z.string(),
      }),
    )
    .optional(),
});

/* ─── Helper: find board + verify access ─── */

async function findBoardWithAccess(boardId: string, userId: string) {
  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");
  return board;
}

/* ─── GET /api/boards/[boardId] ─── */

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  return successResponse(board);
});

/* ─── PATCH /api/boards/[boardId] ─── */

export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  const body = updateBoardSchema.parse(await req.json());
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  const member = board.members.find(
    (m) => m.userId.toString() === userId,
  );
  if (!member || (member.role !== "owner" && member.role !== "editor")) {
    return badRequest("Insufficient permissions");
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.columns !== undefined) updates.columns = body.columns;
  if (body.labels !== undefined) updates.labels = body.labels;

  const updated = await Board.findByIdAndUpdate(boardId, { $set: updates }, { new: true }).lean();
  return successResponse(updated);
});

/* ─── DELETE /api/boards/[boardId] ─── */

export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  if (board.ownerId.toString() !== userId) {
    return badRequest("Only the board owner can delete it");
  }

  await Board.findByIdAndDelete(boardId);
  return successResponse({ deleted: true });
});

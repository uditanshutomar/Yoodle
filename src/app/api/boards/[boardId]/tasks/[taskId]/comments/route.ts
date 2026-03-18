import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";
import { findBoardWithAccess } from "@/lib/board/helpers";

const createCommentSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new NotFoundError("Task not found");
  }

  // Verify task belongs to this board (prevents cross-board data leak)
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: board._id,
  }).lean();
  if (!task) throw new NotFoundError("Task not found on this board");

  const comments = await TaskComment.find({
    taskId: new mongoose.Types.ObjectId(taskId),
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return successResponse(comments);
});

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  const body = createCommentSchema.parse(await req.json());
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new NotFoundError("Task not found");
  }

  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await findBoardWithAccess(boardId, userId);

  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: board._id,
  }).lean();
  if (!task) throw new NotFoundError("Task not found");

  const comment = await TaskComment.create({
    taskId: new mongoose.Types.ObjectId(taskId),
    authorId: userOid,
    type: "comment",
    content: body.content,
  });

  return successResponse(comment, 201);
});

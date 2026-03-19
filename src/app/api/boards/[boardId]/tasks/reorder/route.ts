import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";
import { findBoardWithAccess, verifyEditAccess } from "@/lib/board/helpers";

const reorderSchema = z.object({
  tasks: z.array(
    z.object({
      taskId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid task ID" }),
      columnId: z.string().max(50),
      position: z.number().min(0).max(1_000_000),
    }),
  ).max(500),
});

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  const body = reorderSchema.parse(await req.json());
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  verifyEditAccess(board, userId);

  // Validate all columnIds exist on this board
  const validColumnIds = new Set(board.columns.map((c) => c.id));
  const invalidCol = body.tasks.find((t) => !validColumnIds.has(t.columnId));
  if (invalidCol) throw new BadRequestError(`Invalid column ID: ${invalidCol.columnId}`);

  // Identify "done" columns for completedAt tracking
  const doneColumnIds = new Set(
    board.columns
      .filter((c) => c.title.toLowerCase() === "done")
      .map((c) => c.id)
  );

  // Batch update positions + track completedAt
  const bulkOps = body.tasks.map((t) => {
    const isDone = doneColumnIds.has(t.columnId);
    const update: Record<string, unknown> = {
      $set: {
        columnId: t.columnId,
        position: t.position,
        ...(isDone ? { completedAt: new Date() } : {}),
      },
    };
    if (!isDone) {
      update.$unset = { completedAt: 1 };
    }
    return {
      updateOne: {
        filter: {
          _id: new mongoose.Types.ObjectId(t.taskId),
          boardId: new mongoose.Types.ObjectId(boardId),
        },
        update,
      },
    };
  });

  await Task.bulkWrite(bulkOps);
  return successResponse({ reordered: body.tasks.length });
});

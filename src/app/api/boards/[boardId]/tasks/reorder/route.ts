import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";

const reorderSchema = z.object({
  tasks: z.array(
    z.object({
      taskId: z.string(),
      columnId: z.string(),
      position: z.number(),
    }),
  ),
});

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  const body = reorderSchema.parse(await req.json());
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  // Batch update positions
  const bulkOps = body.tasks.map((t) => ({
    updateOne: {
      filter: {
        _id: new mongoose.Types.ObjectId(t.taskId),
        boardId: new mongoose.Types.ObjectId(boardId),
      },
      update: { $set: { columnId: t.columnId, position: t.position } },
    },
  }));

  await Task.bulkWrite(bulkOps);
  return successResponse({ reordered: body.tasks.length });
});

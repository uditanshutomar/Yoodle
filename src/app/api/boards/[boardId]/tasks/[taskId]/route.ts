import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";
import { findBoardWithAccess, verifyEditAccess } from "@/lib/board/helpers";

/* ─── Validation ─── */

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  columnId: z.string().max(50).optional(),
  position: z.number().min(0).max(1_000_000).optional(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  assigneeId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid assignee ID" }).nullable().optional(),
  labels: z.array(z.string().max(100)).max(50).optional(),
  dueDate: z.string().datetime({ message: "Invalid ISO date" }).nullable().optional(),
  startDate: z.string().datetime({ message: "Invalid ISO date" }).nullable().optional(),
  subtasks: z
    .array(
      z.object({
        id: z.string().max(50),
        title: z.string().min(1).max(500),
        done: z.boolean(),
        assigneeId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid subtask assignee ID" }).optional(),
      }),
    )
    .max(100)
    .optional(),
  estimatePoints: z.number().min(0).max(1000).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

/* ─── GET /api/boards/[boardId]/tasks/[taskId] ─── */

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new NotFoundError("Task not found");
  }

  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: board._id,
  }).lean();
  if (!task) throw new NotFoundError("Task not found");

  return successResponse(task);
});

/* ─── PATCH /api/boards/[boardId]/tasks/[taskId] ─── */

export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  const body = updateTaskSchema.parse(await req.json());
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new NotFoundError("Task not found");
  }

  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await findBoardWithAccess(boardId, userId);
  verifyEditAccess(board, userId);

  // Validate columnId exists on this board
  if (body.columnId !== undefined) {
    const colExists = board.columns.some((c) => c.id === body.columnId);
    if (!colExists) throw new BadRequestError(`Invalid column ID: ${body.columnId}`);
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.columnId !== undefined) updates.columnId = body.columnId;
  if (body.position !== undefined) updates.position = body.position;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.assigneeId !== undefined) {
    updates.assigneeId = body.assigneeId
      ? new mongoose.Types.ObjectId(body.assigneeId)
      : null;
  }
  if (body.labels !== undefined) updates.labels = body.labels;
  if (body.dueDate !== undefined) {
    updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.startDate !== undefined) {
    updates.startDate = body.startDate ? new Date(body.startDate) : null;
  }
  if (body.subtasks !== undefined) updates.subtasks = body.subtasks;
  if (body.estimatePoints !== undefined) updates.estimatePoints = body.estimatePoints;

  // Track completion
  if (body.columnId) {
    const col = board.columns.find((c) => c.id === body.columnId);
    if (col && col.title.toLowerCase() === "done") {
      updates.completedAt = new Date();
    } else {
      updates.completedAt = null;
    }
  }

  // Log activity for key field changes
  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: board._id,
  }).lean();
  if (!task) throw new NotFoundError("Task not found");

  const activityEntries: { field: string; from: string; to: string }[] = [];
  if (body.columnId && body.columnId !== task.columnId) {
    const fromCol = board.columns.find((c) => c.id === task.columnId);
    const toCol = board.columns.find((c) => c.id === body.columnId);
    activityEntries.push({ field: "status", from: fromCol?.title || task.columnId, to: toCol?.title || body.columnId });
  }
  if (body.priority && body.priority !== task.priority) {
    activityEntries.push({ field: "priority", from: task.priority, to: body.priority });
  }

  // Batch create activity logs
  if (activityEntries.length > 0) {
    await TaskComment.insertMany(
      activityEntries.map((change) => ({
        taskId: new mongoose.Types.ObjectId(taskId),
        authorId: userOid,
        type: "activity",
        content: `Changed ${change.field} from "${change.from}" to "${change.to}"`,
        changes: change,
      })),
    );
  }

  const updated = await Task.findByIdAndUpdate(taskId, { $set: updates }, { new: true }).lean();
  return successResponse(updated);
});

/* ─── DELETE /api/boards/[boardId]/tasks/[taskId] ─── */

export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new NotFoundError("Task not found");
  }

  const board = await findBoardWithAccess(boardId, userId);
  verifyEditAccess(board, userId);

  const deleted = await Task.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: board._id,
  });

  if (!deleted) throw new NotFoundError("Task not found");

  await TaskComment.deleteMany({ taskId: new mongoose.Types.ObjectId(taskId) });

  return successResponse({ deleted: true });
});

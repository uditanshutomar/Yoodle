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
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";

/* ─── Validation ─── */

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  columnId: z.string().optional(),
  position: z.number().optional(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  assigneeId: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  subtasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500),
        done: z.boolean(),
        assigneeId: z.string().optional(),
      }),
    )
    .optional(),
  estimatePoints: z.number().min(0).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

/* ─── GET /api/boards/[boardId]/tasks/[taskId] ─── */

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  const task = await Task.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: new mongoose.Types.ObjectId(boardId),
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

  const userOid = new mongoose.Types.ObjectId(userId);

  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  const member = board.members.find((m) => m.userId.toString() === userId);
  if (member && member.role === "viewer") return badRequest("Viewers cannot edit tasks");

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
    boardId: new mongoose.Types.ObjectId(boardId),
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

  const userOid = new mongoose.Types.ObjectId(userId);

  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  const member = board.members.find((m) => m.userId.toString() === userId);
  if (member && member.role === "viewer") return badRequest("Viewers cannot delete tasks");

  await Task.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(taskId),
    boardId: new mongoose.Types.ObjectId(boardId),
  });
  await TaskComment.deleteMany({ taskId: new mongoose.Types.ObjectId(taskId) });

  return successResponse({ deleted: true });
});

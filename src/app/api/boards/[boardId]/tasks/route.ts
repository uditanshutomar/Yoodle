import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { nanoid } from "nanoid";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, badRequest } from "@/lib/infra/api/response";
import { NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";

/* ─── Validation ─── */

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  columnId: z.string(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  assigneeId: z.string().optional(),
  labels: z.array(z.string()).optional(),
  dueDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" }).optional(),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" }).optional(),
  subtasks: z
    .array(z.object({ title: z.string().min(1).max(500) }))
    .optional(),
});

/* ─── GET /api/boards/[boardId]/tasks ─── */

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(boardId)) {
    return badRequest("Invalid board ID");
  }

  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Verify board access
  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  // Parse query filters
  const url = new URL(req.url);
  const columnId = url.searchParams.get("columnId");
  const assigneeId = url.searchParams.get("assigneeId");
  const priority = url.searchParams.get("priority");

  const filter: Record<string, unknown> = { boardId: new mongoose.Types.ObjectId(boardId) };
  if (columnId) filter.columnId = columnId;
  if (assigneeId) filter.assigneeId = new mongoose.Types.ObjectId(assigneeId);
  if (priority) filter.priority = priority;

  const tasks = await Task.find(filter)
    .sort({ columnId: 1, position: 1 })
    .limit(200)
    .lean();

  return successResponse(tasks);
});

/* ─── POST /api/boards/[boardId]/tasks ─── */

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(boardId)) {
    return badRequest("Invalid board ID");
  }

  const body = createTaskSchema.parse(await req.json());
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);
  const boardOid = new mongoose.Types.ObjectId(boardId);

  // Verify board access + editor role
  const board = await Board.findOne({
    _id: boardOid,
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  const member = board.members.find((m) => m.userId.toString() === userId);
  if (member && member.role === "viewer") return badRequest("Viewers cannot create tasks");

  // Validate columnId exists
  const column = board.columns.find((c) => c.id === body.columnId);
  if (!column) return badRequest("Invalid columnId");

  // Calculate position (append to end of column)
  const lastTask = await Task.findOne({ boardId: boardOid, columnId: body.columnId })
    .sort({ position: -1 })
    .lean();
  const position = lastTask ? lastTask.position + 1024 : 1024;

  const task = await Task.create({
    boardId: boardOid,
    columnId: body.columnId,
    position,
    title: body.title,
    description: body.description,
    priority: body.priority || "none",
    creatorId: userOid,
    assigneeId: body.assigneeId ? new mongoose.Types.ObjectId(body.assigneeId) : undefined,
    labels: body.labels || [],
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    subtasks: (body.subtasks || []).map((s) => ({
      id: nanoid(8),
      title: s.title,
      done: false,
    })),
    source: { type: "manual" },
  });

  return successResponse(task, 201);
});

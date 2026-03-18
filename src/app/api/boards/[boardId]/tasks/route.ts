import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { nanoid } from "nanoid";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";
import { findBoardWithAccess, verifyEditAccess } from "@/lib/board/helpers";

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
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);

  // Parse query filters
  const url = new URL(req.url);
  const columnId = url.searchParams.get("columnId");
  const assigneeId = url.searchParams.get("assigneeId");
  const priority = url.searchParams.get("priority");

  const filter: Record<string, unknown> = { boardId: board._id };
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
  const body = createTaskSchema.parse(await req.json());
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await findBoardWithAccess(boardId, userId);
  verifyEditAccess(board, userId);

  // Validate columnId exists
  const column = board.columns.find((c) => c.id === body.columnId);
  if (!column) throw new BadRequestError("Invalid columnId");

  // Calculate position (append to end of column)
  const lastTask = await Task.findOne({ boardId: board._id, columnId: body.columnId })
    .sort({ position: -1 })
    .lean();
  const position = lastTask ? lastTask.position + 1024 : 1024;

  const task = await Task.create({
    boardId: board._id,
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

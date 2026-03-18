import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";
import Board from "@/lib/infra/db/models/board";
import {
  isValidObjectId,
  verifyTaskAccess,
  verifyBoardAccess,
  getOrCreatePersonalBoard,
} from "./helpers";
import type { ToolResult } from "@/lib/ai/tools";

export async function getPersonalBoard(userId: string) {
  await connectDB();
  return getOrCreatePersonalBoard(userId);
}

export async function createBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const boardId = args.boardId as string | undefined;
  if (boardId && !isValidObjectId(boardId)) return { success: false, summary: "Invalid board ID." };
  const board = boardId ? await verifyBoardAccess(userId, boardId) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found or access denied." };

  const columnId = (args.columnId as string) || board.columns[0]?.id;
  if (!columnId) return { success: false, summary: "Board has no columns." };

  const lastTask = await Task.findOne({ boardId: board._id, columnId }).sort({ position: -1 }).lean();
  const position = lastTask ? lastTask.position + 1024 : 1024;

  const task = await Task.create({
    boardId: board._id, columnId, position,
    title: args.title as string,
    description: args.description as string | undefined,
    priority: (args.priority as string) || "none",
    creatorId: userId,
    assigneeId: args.assigneeId as string | undefined,
    dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
    labels: (args.labels as string[]) || [],
    subtasks: [], linkedDocs: [], linkedEmails: [], collaborators: [],
    source: { type: "ai" },
  });

  return {
    success: true,
    summary: `Created task "${task.title}" on board "${board.title}"${task.dueDate ? ` (due: ${task.dueDate.toISOString().split("T")[0]})` : ""}`,
    data: { taskId: task._id.toString(), boardId: board._id.toString(), title: task.title },
  };
}

export async function updateBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const access = await verifyTaskAccess(userId, args.taskId as string);
  if (!access) return { success: false, summary: "Task not found or access denied." };
  const { task } = access;
  if (args.title) task.title = args.title as string;
  if (args.description !== undefined) task.description = args.description as string;
  if (args.priority) task.priority = args.priority as "urgent" | "high" | "medium" | "low" | "none";
  if (args.dueDate) task.dueDate = new Date(args.dueDate as string);
  if (args.labels) task.labels = args.labels as string[];
  await task.save();
  return { success: true, summary: `Updated task "${task.title}"`, data: { taskId: task._id.toString(), title: task.title } };
}

export async function moveBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const access = await verifyTaskAccess(userId, args.taskId as string);
  if (!access) return { success: false, summary: "Task not found or access denied." };
  const { task, board } = access;
  const targetCol = board.columns?.find((c: { id: string; title: string }) => c.id === (args.columnId as string));
  if (!targetCol) return { success: false, summary: "Target column not found." };
  const lastInCol = await Task.findOne({ boardId: task.boardId, columnId: targetCol.id }).sort({ position: -1 }).lean();
  task.columnId = targetCol.id;
  task.position = lastInCol ? lastInCol.position + 1024 : 1024;
  if (targetCol.title === "Done" && !task.completedAt) task.completedAt = new Date();
  else if (targetCol.title !== "Done" && task.completedAt) task.completedAt = undefined;
  await task.save();
  return { success: true, summary: `Moved "${task.title}" to "${targetCol.title}"`, data: { taskId: task._id.toString(), column: targetCol.title } };
}

export async function assignBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  if (!isValidObjectId(args.assigneeId)) return { success: false, summary: "Invalid assignee ID." };
  const access = await verifyTaskAccess(userId, args.taskId as string);
  if (!access) return { success: false, summary: "Task not found or access denied." };

  // Verify the assignee is a member of the task's board
  const isMember = access.board.ownerId.toString() === (args.assigneeId as string) ||
    access.board.members?.some((m: { userId: { toString(): string } }) => m.userId.toString() === (args.assigneeId as string));
  if (!isMember) return { success: false, summary: "Assignee is not a member of this board." };

  await Task.findByIdAndUpdate(access.task._id, { $set: { assigneeId: args.assigneeId as string } });
  return { success: true, summary: `Assigned "${access.task.title}" to user ${args.assigneeId}`, data: { taskId: access.task._id.toString() } };
}

export async function deleteBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const access = await verifyTaskAccess(userId, args.taskId as string);
  if (!access) return { success: false, summary: "Task not found or access denied." };
  await TaskComment.deleteMany({ taskId: access.task._id });
  await Task.findByIdAndDelete(access.task._id);
  return { success: true, summary: `Deleted task "${access.task.title}"` };
}

export async function listBoardTasks(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const filter: Record<string, unknown> = { completedAt: null };
  if (args.boardId) {
    if (!isValidObjectId(args.boardId as string)) return { success: false, summary: "Invalid board ID." };
    const board = await verifyBoardAccess(userId, args.boardId as string);
    if (!board) return { success: false, summary: "Board not found or access denied." };
    filter.boardId = board._id;
  } else {
    const boards = await Board.find({ $or: [{ ownerId: userId }, { "members.userId": userId }] }).select("_id").lean();
    filter.boardId = { $in: boards.map((b) => b._id) };
  }
  if (args.assigneeId) filter.assigneeId = args.assigneeId;
  if (args.priority) filter.priority = args.priority;
  if (args.columnId) filter.columnId = args.columnId;
  if (args.overdueOnly) filter.dueDate = { $lt: new Date() };
  const limit = Math.min((args.limit as number) || 20, 50);
  const tasks = await Task.find(filter).select("title priority columnId dueDate assigneeId").sort({ dueDate: 1, priority: -1 }).limit(limit).populate("assigneeId", "displayName name").lean();
  return {
    success: true,
    summary: `Found ${tasks.length} task(s)`,
    data: tasks.map((t) => ({
      id: t._id.toString(), title: t.title, priority: t.priority, column: t.columnId, dueDate: t.dueDate,
      assignee: (t.assigneeId as { displayName?: string; name?: string } | null)?.displayName || null,
    })),
  };
}

export async function searchBoardTasks(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  // Escape regex special characters to prevent injection
  const rawQuery = (args.query as string) || "";
  const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let boardFilter: unknown;
  if (args.boardId) {
    if (!isValidObjectId(args.boardId as string)) return { success: false, summary: "Invalid board ID." };
    const board = await verifyBoardAccess(userId, args.boardId as string);
    if (!board) return { success: false, summary: "Board not found or access denied." };
    boardFilter = board._id;
  } else {
    const boards = await Board.find({ $or: [{ ownerId: userId }, { "members.userId": userId }] }).select("_id").lean();
    boardFilter = { $in: boards.map((b) => b._id) };
  }

  const filter: Record<string, unknown> = {
    boardId: boardFilter,
    $or: [
      { title: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } },
    ],
  };
  const tasks = await Task.find(filter).select("title priority dueDate assigneeId").limit(15).populate("assigneeId", "displayName name").lean();
  return {
    success: true,
    summary: `Found ${tasks.length} task(s) matching "${rawQuery}"`,
    data: tasks.map((t) => ({ id: t._id.toString(), title: t.title, priority: t.priority, dueDate: t.dueDate })),
  };
}

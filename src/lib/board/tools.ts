import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import { nanoid } from "nanoid";
import type { ToolResult } from "@/lib/ai/tools";

export async function getPersonalBoard(userId: string) {
  await connectDB();
  let board = await Board.findOne({ ownerId: userId, scope: "personal" });
  if (!board) {
    board = await Board.create({
      title: "Personal",
      ownerId: userId,
      scope: "personal",
      members: [{ userId, role: "owner", joinedAt: new Date() }],
      columns: [
        { id: nanoid(8), title: "To Do", color: "#6B7280", position: 0 },
        { id: nanoid(8), title: "In Progress", color: "#3B82F6", position: 1 },
        { id: nanoid(8), title: "Review", color: "#F59E0B", position: 2 },
        { id: nanoid(8), title: "Done", color: "#10B981", position: 3 },
      ],
      labels: [],
    });
  }
  return board;
}

export async function createBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const boardId = args.boardId as string | undefined;
  const board = boardId ? await Board.findById(boardId) : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };

  const columnId = (args.columnId as string) || board.columns[0]?.id;
  if (!columnId) return { success: false, summary: "Board has no columns." };

  const lastTask = await Task.findOne({ boardId: board._id, columnId }).sort({ position: -1 }).lean();
  const position = (lastTask?.position ?? 0) + 1;

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
  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };
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
  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };
  const board = await Board.findById(task.boardId);
  const targetCol = board?.columns?.find((c: { id: string; title: string }) => c.id === (args.columnId as string));
  if (!targetCol) return { success: false, summary: "Target column not found." };
  const lastInCol = await Task.findOne({ boardId: task.boardId, columnId: targetCol.id }).sort({ position: -1 }).lean();
  task.columnId = targetCol.id;
  task.position = (lastInCol?.position ?? 0) + 1;
  if (targetCol.title === "Done" && !task.completedAt) task.completedAt = new Date();
  else if (targetCol.title !== "Done" && task.completedAt) task.completedAt = undefined;
  await task.save();
  return { success: true, summary: `Moved "${task.title}" to "${targetCol.title}"`, data: { taskId: task._id.toString(), column: targetCol.title } };
}

export async function assignBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findByIdAndUpdate(args.taskId as string, { $set: { assigneeId: args.assigneeId as string } }, { new: true });
  if (!task) return { success: false, summary: "Task not found." };
  return { success: true, summary: `Assigned "${task.title}" to user ${args.assigneeId}`, data: { taskId: task._id.toString() } };
}

export async function deleteBoardTask(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findByIdAndDelete(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };
  return { success: true, summary: `Deleted task "${task.title}"` };
}

export async function listBoardTasks(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
  await connectDB();
  const filter: Record<string, unknown> = { completedAt: null };
  if (args.boardId) {
    filter.boardId = args.boardId;
  } else {
    const boards = await Board.find({ $or: [{ ownerId: userId }, { "members.userId": userId }] }).lean();
    filter.boardId = { $in: boards.map((b) => b._id) };
  }
  if (args.assigneeId) filter.assigneeId = args.assigneeId;
  if (args.priority) filter.priority = args.priority;
  if (args.columnId) filter.columnId = args.columnId;
  if (args.overdueOnly) filter.dueDate = { $lt: new Date() };
  const limit = Math.min((args.limit as number) || 20, 50);
  const tasks = await Task.find(filter).sort({ dueDate: 1, priority: -1 }).limit(limit).populate("assigneeId", "displayName name").lean();
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
  const boards = await Board.find({ $or: [{ ownerId: userId }, { "members.userId": userId }] }).lean();
  const filter: Record<string, unknown> = {
    boardId: args.boardId ? args.boardId : { $in: boards.map((b) => b._id) },
    $or: [
      { title: { $regex: args.query as string, $options: "i" } },
      { description: { $regex: args.query as string, $options: "i" } },
    ],
  };
  const tasks = await Task.find(filter).limit(15).populate("assigneeId", "displayName name").lean();
  return {
    success: true,
    summary: `Found ${tasks.length} task(s) matching "${args.query}"`,
    data: tasks.map((t) => ({ id: t._id.toString(), title: t.title, priority: t.priority, dueDate: t.dueDate })),
  };
}

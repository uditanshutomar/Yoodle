import mongoose from "mongoose";
import Board, { IBoardDocument } from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import { NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import { nanoid } from "nanoid";

// ── Shared Validation ──────────────────────────────────────────────

/** Validate that a value is a valid MongoDB ObjectId string */
export function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

// ── Null-returning Access Checks (for AI tool functions) ───────────

/**
 * Verify the user has access to the board that owns a task.
 * Returns null instead of throwing — used by AI tool functions that
 * return ToolResult objects rather than throwing errors.
 */
export async function verifyTaskAccess(
  userId: string,
  taskId: string,
): Promise<{ task: InstanceType<typeof Task>; board: InstanceType<typeof Board> } | null> {
  if (!isValidObjectId(taskId)) return null;
  const task = await Task.findById(taskId);
  if (!task) return null;
  const board = await Board.findOne({
    _id: task.boardId,
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  });
  if (!board) return null;
  return { task, board };
}

/**
 * Verify the user has access to a specific board.
 * Returns null instead of throwing — used by AI tool functions.
 */
export async function verifyBoardAccess(
  userId: string,
  boardId: string,
): Promise<InstanceType<typeof Board> | null> {
  if (!isValidObjectId(boardId)) return null;
  return Board.findOne({
    _id: boardId,
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  });
}

// ── Throwing Access Checks (for API routes) ────────────────────────

export function generateDefaultColumns() {
  return [
    { id: nanoid(8), title: "To Do", color: "#6B7280", position: 0 },
    { id: nanoid(8), title: "In Progress", color: "#3B82F6", position: 1 },
    { id: nanoid(8), title: "Review", color: "#F59E0B", position: 2 },
    { id: nanoid(8), title: "Done", color: "#10B981", position: 3 },
  ];
}

export function generateDefaultLabels() {
  return [
    { id: nanoid(8), name: "Bug", color: "#EF4444" },
    { id: nanoid(8), name: "Feature", color: "#8B5CF6" },
    { id: nanoid(8), name: "Design", color: "#EC4899" },
    { id: nanoid(8), name: "Urgent", color: "#F97316" },
  ];
}

export async function getOrCreatePersonalBoard(
  userId: string,
): Promise<IBoardDocument> {
  const userOid = new mongoose.Types.ObjectId(userId);

  let board = await Board.findOne({ ownerId: userOid, scope: "personal" }).lean() as IBoardDocument | null;

  if (!board) {
    board = await Board.create({
      title: "My Tasks",
      ownerId: userOid,
      scope: "personal",
      members: [{ userId: userOid, role: "owner", joinedAt: new Date() }],
      columns: generateDefaultColumns(),
      labels: generateDefaultLabels(),
    });
  }

  return board;
}

/**
 * Find a board by ID and verify the user has access (owner or member).
 * Throws NotFoundError if the board doesn't exist or user lacks access.
 */
export async function findBoardWithAccess(boardId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(boardId)) {
    throw new NotFoundError("Board not found");
  }
  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");
  return board;
}

/**
 * Verify the user has edit access (not a viewer) on the given board.
 * Throws ForbiddenError if the user is a viewer.
 */
export function verifyEditAccess(
  board: { members: Array<{ userId: { toString(): string }; role: string }> },
  userId: string,
): void {
  const member = board.members.find((m) => m.userId.toString() === userId);
  if (member && member.role === "viewer") {
    throw new ForbiddenError("Viewers cannot perform this action");
  }
}

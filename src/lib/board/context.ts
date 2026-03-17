import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("board:context");

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface BoardContextResult {
  contextXml: string;
  taskCount: number;
  overdueCount: number;
  taskIds: string[];
}

export async function buildBoardContext(
  userId: string
): Promise<BoardContextResult> {
  const empty: BoardContextResult = {
    contextXml: "",
    taskCount: 0,
    overdueCount: 0,
    taskIds: [],
  };

  try {
    await connectDB();

    const boards = await Board.find({
      $or: [
        { ownerId: userId },
        { "members.userId": userId },
      ],
    }).lean();

    if (boards.length === 0) return empty;

    const boardIds = boards.map((b) => b._id);
    const boardMap = new Map(boards.map((b) => [b._id.toString(), b]));

    const tasks = await Task.find({
      boardId: { $in: boardIds },
      completedAt: null,
    })
      .populate("assigneeId", "displayName name")
      .lean();

    if (tasks.length === 0) return empty;

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const priorityWeight: Record<string, number> = {
      urgent: 5, high: 4, medium: 3, low: 2, none: 1,
    };

    const scored = tasks.map((t) => {
      const isOverdue = t.dueDate && new Date(t.dueDate) < now;
      const isDueToday = t.dueDate && new Date(t.dueDate) <= todayEnd && !isOverdue;
      const score =
        (isOverdue ? 1000 : 0) +
        (isDueToday ? 500 : 0) +
        (priorityWeight[t.priority] || 1) * 10;
      return { task: t, score, isOverdue, isDueToday };
    });

    scored.sort((a, b) => b.score - a.score);

    const topTasks = scored.slice(0, 15);
    const overdueCount = scored.filter((s) => s.isOverdue).length;
    const dueTodayCount = scored.filter((s) => s.isDueToday).length;
    const inProgressCount = tasks.filter((t) => {
      const board = boardMap.get(t.boardId.toString());
      if (!board) return false;
      const col = board.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
      return col?.title === "In Progress";
    }).length;

    const taskLines = topTasks.map(({ task: t, isOverdue }) => {
      const board = boardMap.get(t.boardId.toString());
      const col = board?.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
      const assignee = t.assigneeId as { _id: string; displayName?: string; name?: string } | null;
      const assigneeName = assignee?._id?.toString() === userId ? "You" : (assignee?.displayName || assignee?.name || "Unassigned");
      const subtasksDone = t.subtasks?.filter((s: { done: boolean }) => s.done).length || 0;
      const subtasksTotal = t.subtasks?.length || 0;

      let attrs = `id="${t._id}" title="${escapeXml(t.title)}"`;
      attrs += ` board="${escapeXml(board?.title || "Unknown")}"`;
      attrs += ` column="${escapeXml(col?.title || "Unknown")}"`;
      attrs += ` priority="${t.priority}"`;
      if (t.dueDate) attrs += ` due="${new Date(t.dueDate).toISOString().split("T")[0]}"`;
      if (isOverdue) attrs += ` overdue="true"`;
      attrs += ` assignee="${escapeXml(assigneeName)}"`;
      if (subtasksTotal > 0) attrs += ` subtasks-done="${subtasksDone}" subtasks-total="${subtasksTotal}"`;
      if (t.meetingId) attrs += ` meeting-linked="true"`;

      return `      <task ${attrs} />`;
    });

    const boardSummaries = boards.map((b) => {
      const boardTasks = tasks.filter((t) => t.boardId.toString() === b._id.toString());
      const boardOverdue = boardTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length;
      const boardInProgress = boardTasks.filter((t) => {
        const col = b.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
        return col?.title === "In Progress";
      }).length;
      return `      <board name="${escapeXml(b.title)}" scope="${b.scope}" total="${boardTasks.length}" in-progress="${boardInProgress}" overdue="${boardOverdue}" />`;
    });

    const xml = `  <board-tasks>
    <my-tasks count="${tasks.length}" overdue="${overdueCount}" due-today="${dueTodayCount}" in-progress="${inProgressCount}">
${taskLines.join("\n")}
    </my-tasks>
    <shared-boards>
${boardSummaries.join("\n")}
    </shared-boards>
  </board-tasks>`;

    return {
      contextXml: xml,
      taskCount: tasks.length,
      overdueCount,
      taskIds: tasks.map((t) => t._id.toString()),
    };
  } catch (err) {
    log.error({ err }, "failed to build board context");
    return empty;
  }
}

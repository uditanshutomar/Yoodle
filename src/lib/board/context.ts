import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import Meeting from "@/lib/infra/db/models/meeting";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
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
      const assignee = t.assigneeId as unknown as { _id: string; displayName?: string; name?: string } | null;
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

/* ------------------------------------------------------------------ */
/*  Meeting context                                                    */
/* ------------------------------------------------------------------ */

export interface MeetingContextResult {
  contextXml: string;
  unresolvedActions: number;
}

export async function buildMeetingContext(
  userId: string
): Promise<MeetingContextResult> {
  const empty: MeetingContextResult = { contextXml: "", unresolvedActions: 0 };

  try {
    await connectDB();

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000);

    // Upcoming meetings (next 3 days) — exclude large fields like ghostMessages
    const upcoming = await Meeting.find({
      "participants.userId": userId,
      status: { $in: ["scheduled", "live"] },
      scheduledAt: { $gte: now, $lte: threeDaysFromNow },
    })
      .select("title status scheduledAt participants")
      .sort({ scheduledAt: 1 })
      .limit(5)
      .populate("participants.userId", "displayName name")
      .lean();

    // Recent completed meetings (last 3 days) with MoM — exclude large fields
    const recent = await Meeting.find({
      "participants.userId": userId,
      status: "ended",
      endedAt: { $gte: threeDaysAgo },
    })
      .select("title status endedAt mom")
      .sort({ endedAt: -1 })
      .limit(3)
      .lean();

    if (upcoming.length === 0 && recent.length === 0) return empty;

    let unresolvedActions = 0;
    // Query linked tasks for both upcoming and recent meetings
    const allMeetingIds = [...upcoming, ...recent].map((m) => m._id);
    const linkedTasks =
      allMeetingIds.length > 0
        ? await Task.find({ meetingId: { $in: allMeetingIds } }).select("meetingId").lean()
        : [];

    const upcomingLines = upcoming.map((m) => {
      const participants = (
        m.participants as unknown as {
          userId: { displayName?: string; name?: string } | null;
        }[]
      )
        ?.map(
          (p) =>
            p.userId && typeof p.userId === "object"
              ? p.userId.displayName || p.userId.name || ""
              : ""
        )
        .filter(Boolean)
        .slice(0, 5)
        .join(", ");

      const linkedTaskCount = linkedTasks.filter(
        (t) => t.meetingId?.toString() === m._id.toString()
      ).length;

      let attrs = `id="${m._id}" title="${escapeXml(m.title)}"`;
      attrs += ` at="${m.scheduledAt?.toISOString() || ""}"`;
      if (participants)
        attrs += ` participants="${escapeXml(participants)}"`;
      if (linkedTaskCount > 0)
        attrs += ` has-linked-tasks="true" linked-task-count="${linkedTaskCount}"`;
      attrs += ` status="${m.status}"`;
      return `      <meeting ${attrs} />`;
    });

    const recentLines = recent.map((m) => {
      const hasMom = !!m.mom?.summary;
      const actionCount = m.mom?.actionItems?.length || 0;
      const linkedCount = linkedTasks.filter(
        (t) => t.meetingId?.toString() === m._id.toString()
      ).length;
      const unresolved =
        hasMom && actionCount > 0 ? Math.max(0, actionCount - linkedCount) : 0;
      unresolvedActions += unresolved;

      let attrs = `id="${m._id}" title="${escapeXml(m.title)}"`;
      attrs += ` ended="${m.endedAt?.toISOString() || ""}"`;
      attrs += ` has-mom="${hasMom}"`;
      if (unresolved > 0) attrs += ` unresolved-actions="${unresolved}"`;
      return `      <meeting ${attrs} />`;
    });

    const parts: string[] = [];
    if (upcomingLines.length > 0) {
      parts.push(
        `    <upcoming count="${upcomingLines.length}">\n${upcomingLines.join("\n")}\n    </upcoming>`
      );
    }
    if (recentLines.length > 0) {
      parts.push(
        `    <recent-completed count="${recentLines.length}">\n${recentLines.join("\n")}\n    </recent-completed>`
      );
    }

    return {
      contextXml: `  <meetings>\n${parts.join("\n")}\n  </meetings>`,
      unresolvedActions,
    };
  } catch (err) {
    log.error({ err }, "failed to build meeting context");
    return empty;
  }
}

/* ------------------------------------------------------------------ */
/*  Conversation context                                               */
/* ------------------------------------------------------------------ */

export interface ConversationContextResult {
  contextXml: string;
  activeThreadCount: number;
}

export async function buildConversationContextSummary(
  userId: string
): Promise<ConversationContextResult> {
  const empty: ConversationContextResult = {
    contextXml: "",
    activeThreadCount: 0,
  };

  try {
    await connectDB();

    const oneDayAgo = new Date(Date.now() - 86400000);

    const conversations = await Conversation.find({
      "participants.userId": userId,
      lastMessageAt: { $gte: oneDayAgo },
    })
      .select("name type participants lastMessageAt")
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .lean();

    if (conversations.length === 0) return empty;

    const threadLines = await Promise.all(
      conversations.map(async (c) => {
        const participant = c.participants?.find(
          (p: { userId: string | { toString(): string } }) =>
            p.userId?.toString() === userId
        );
        const lastReadAt = participant?.lastReadAt || new Date(0);

        const unreadCount = await DirectMessage.countDocuments({
          conversationId: c._id,
          createdAt: { $gt: lastReadAt },
          senderId: { $ne: userId },
        });

        const name =
          c.name || (c.type === "dm" ? "Direct message" : "Group chat");
        let attrs = `id="${c._id}" name="${escapeXml(name)}"`;
        if (unreadCount > 0) attrs += ` unread="${unreadCount}"`;
        attrs += ` last-activity="${c.lastMessageAt?.toISOString() || ""}"`;
        return `      <thread ${attrs} />`;
      })
    );

    const activeCount = conversations.length;
    const xml = `  <conversations>
    <active-threads count="${activeCount}">
${threadLines.join("\n")}
    </active-threads>
  </conversations>`;

    return { contextXml: xml, activeThreadCount: activeCount };
  } catch (err) {
    log.error({ err }, "failed to build conversation context summary");
    return empty;
  }
}

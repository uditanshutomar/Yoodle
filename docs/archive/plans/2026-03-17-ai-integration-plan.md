# AI Integration Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Doodle AI the seamless integration hub across Tasks, Meetings, Chat, Calendar, and Email/Drive — with 15 new cross-domain tools, unified workspace context, and proactive automation behaviors.

**Architecture:** Extend `workspace-context.ts` with board task + meeting + conversation data. Add 7 board task tools and 8 cross-domain tools to `tools.ts`. Update system prompts for proactive cross-domain intelligence. Replace Google Tasks tools with board task tools throughout. Modify chat agent to inject board/meeting context.

**Tech Stack:** MongoDB (Mongoose), Google Gemini function calling, Next.js API routes, Zod validation, TypeScript

**Prerequisite:** Phase 1 (Core Board MVP) must be completed first — Board, Task, TaskComment models and CRUD API routes must exist.

---

### Task 1: Board Context Builder (`src/lib/board/context.ts`)

This module fetches board task data for injection into AI workspace context.

**Files:**
- Create: `src/lib/board/context.ts`
- Test: `src/lib/board/__tests__/context.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/board/__tests__/context.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB models before importing the module under test
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/db/models/board", () => {
  const find = vi.fn();
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/task", () => {
  const find = vi.fn();
  const countDocuments = vi.fn();
  return { default: { find, countDocuments } };
});

import { buildBoardContext } from "../context";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";

describe("buildBoardContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty context when user has no boards", async () => {
    (Board.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: () => Promise.resolve([]),
    });

    const result = await buildBoardContext("user123");
    expect(result.contextXml).toBe("");
    expect(result.taskCount).toBe(0);
    expect(result.overdueCount).toBe(0);
    expect(result.taskIds).toEqual([]);
  });

  it("builds XML context with tasks sorted by urgency", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const tomorrow = new Date(now.getTime() + 86400000);

    (Board.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: () => Promise.resolve([
        {
          _id: "board1",
          title: "Personal",
          scope: "personal",
          columns: [
            { id: "col1", title: "To Do" },
            { id: "col2", title: "In Progress" },
          ],
        },
      ]),
    });

    (Task.find as ReturnType<typeof vi.fn>).mockReturnValue({
      populate: () => ({
        lean: () => Promise.resolve([
          {
            _id: "task1",
            boardId: "board1",
            columnId: "col2",
            title: "Overdue task",
            priority: "high",
            dueDate: yesterday,
            assigneeId: { _id: "user123", displayName: "You" },
            subtasks: [],
            meetingId: null,
          },
          {
            _id: "task2",
            boardId: "board1",
            columnId: "col1",
            title: "Tomorrow task",
            priority: "medium",
            dueDate: tomorrow,
            assigneeId: { _id: "user123", displayName: "You" },
            subtasks: [{ done: true }, { done: false }],
            meetingId: null,
          },
        ]),
      }),
    });

    const result = await buildBoardContext("user123");
    expect(result.taskCount).toBe(2);
    expect(result.overdueCount).toBe(1);
    expect(result.taskIds).toEqual(["task1", "task2"]);
    expect(result.contextXml).toContain("<board-tasks>");
    expect(result.contextXml).toContain('overdue="true"');
    expect(result.contextXml).toContain('title="Overdue task"');
    expect(result.contextXml).toContain('subtasks-done="1"');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/board/__tests__/context.test.ts`
Expected: FAIL — module `../context` not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/board/context.ts
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

    // Find boards where user is owner or member
    const boards = await Board.find({
      $or: [
        { ownerId: userId },
        { "members.userId": userId },
      ],
    }).lean();

    if (boards.length === 0) return empty;

    const boardIds = boards.map((b) => b._id);
    const boardMap = new Map(boards.map((b) => [b._id.toString(), b]));

    // Fetch tasks assigned to user OR on user's boards, not completed
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

    // Score tasks for sorting: overdue first, then due-today, then by priority
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

    // Take top 15 most relevant tasks for context
    const topTasks = scored.slice(0, 15);
    const overdueCount = scored.filter((s) => s.isOverdue).length;
    const dueTodayCount = scored.filter((s) => s.isDueToday).length;
    const inProgressCount = tasks.filter((t) => {
      const board = boardMap.get(t.boardId.toString());
      if (!board) return false;
      const col = board.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
      return col?.title === "In Progress";
    }).length;

    // Build task XML lines
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

    // Build board summary lines
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/board/__tests__/context.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/board/context.ts src/lib/board/__tests__/context.test.ts
git commit -m "feat: add board context builder for AI workspace context"
```

---

### Task 2: Meeting + Conversation Context Builders

Add meeting and conversation context fetching to the same module.

**Files:**
- Modify: `src/lib/board/context.ts`
- Test: `src/lib/board/__tests__/context.test.ts`

**Step 1: Add meeting context builder**

Add to `src/lib/board/context.ts`:

```typescript
import Meeting from "@/lib/infra/db/models/meeting";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";

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

    // Upcoming meetings (next 3 days)
    const upcoming = await Meeting.find({
      "participants.userId": userId,
      status: { $in: ["scheduled", "live"] },
      scheduledAt: { $gte: now, $lte: threeDaysFromNow },
    })
      .sort({ scheduledAt: 1 })
      .limit(5)
      .populate("participants.userId", "displayName name")
      .lean();

    // Recent completed meetings (last 3 days) with MoM
    const recent = await Meeting.find({
      "participants.userId": userId,
      status: "ended",
      endedAt: { $gte: threeDaysAgo },
    })
      .sort({ endedAt: -1 })
      .limit(3)
      .lean();

    if (upcoming.length === 0 && recent.length === 0) return empty;

    // Count unresolved MoM actions across recent meetings
    let unresolvedActions = 0;
    // Check which MoM action items have corresponding board tasks
    const meetingIds = recent.filter((m) => m.mom?.actionItems?.length).map((m) => m._id);
    const linkedTasks = meetingIds.length > 0
      ? await Task.find({ meetingId: { $in: meetingIds } }).lean()
      : [];
    const linkedMeetingIds = new Set(linkedTasks.map((t) => t.meetingId?.toString()));

    const upcomingLines = upcoming.map((m) => {
      const participants = m.participants
        ?.map((p: { userId: { displayName?: string; name?: string } | null }) =>
          p.userId && typeof p.userId === "object" ? (p.userId.displayName || p.userId.name || "") : "")
        .filter(Boolean)
        .slice(0, 5)
        .join(", ");

      // Check if this meeting has linked tasks
      const linkedTaskCount = linkedTasks.filter((t) => t.meetingId?.toString() === m._id.toString()).length;

      let attrs = `id="${m._id}" title="${escapeXml(m.title)}"`;
      attrs += ` at="${m.scheduledAt?.toISOString() || ""}"`;
      if (participants) attrs += ` participants="${escapeXml(participants)}"`;
      if (linkedTaskCount > 0) attrs += ` has-linked-tasks="true" linked-task-count="${linkedTaskCount}"`;
      attrs += ` status="${m.status}"`;
      return `      <meeting ${attrs} />`;
    });

    const recentLines = recent.map((m) => {
      const hasMom = !!m.mom?.summary;
      const actionCount = m.mom?.actionItems?.length || 0;
      const hasLinkedTasks = linkedMeetingIds.has(m._id.toString());
      const unresolved = hasMom && actionCount > 0 && !hasLinkedTasks ? actionCount : 0;
      unresolvedActions += unresolved;

      let attrs = `id="${m._id}" title="${escapeXml(m.title)}"`;
      attrs += ` ended="${m.endedAt?.toISOString() || ""}"`;
      attrs += ` has-mom="${hasMom}"`;
      if (unresolved > 0) attrs += ` unresolved-actions="${unresolved}"`;
      return `      <meeting ${attrs} />`;
    });

    const parts: string[] = [];
    if (upcomingLines.length > 0) {
      parts.push(`    <upcoming count="${upcomingLines.length}">\n${upcomingLines.join("\n")}\n    </upcoming>`);
    }
    if (recentLines.length > 0) {
      parts.push(`    <recent-completed count="${recentLines.length}">\n${recentLines.join("\n")}\n    </recent-completed>`);
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

export interface ConversationContextResult {
  contextXml: string;
  activeThreadCount: number;
}

export async function buildConversationContextSummary(
  userId: string
): Promise<ConversationContextResult> {
  const empty: ConversationContextResult = { contextXml: "", activeThreadCount: 0 };

  try {
    await connectDB();

    const oneDayAgo = new Date(Date.now() - 86400000);

    // Get conversations with recent activity and unread messages
    const conversations = await Conversation.find({
      "participants.userId": userId,
      lastMessageAt: { $gte: oneDayAgo },
    })
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .lean();

    if (conversations.length === 0) return empty;

    const threadLines = await Promise.all(
      conversations.map(async (c) => {
        const participant = c.participants?.find(
          (p: { userId: string | { toString(): string } }) => p.userId?.toString() === userId
        );
        const lastReadAt = participant?.lastReadAt || new Date(0);

        // Count unread messages
        const unreadCount = await DirectMessage.countDocuments({
          conversationId: c._id,
          createdAt: { $gt: lastReadAt },
          senderId: { $ne: userId },
        });

        const name = c.name || (c.type === "dm" ? "Direct message" : "Group chat");
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
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/board/__tests__/context.test.ts`
Expected: PASS (existing tests still pass, new functions untested but exported)

**Step 3: Commit**

```bash
git add src/lib/board/context.ts
git commit -m "feat: add meeting and conversation context builders"
```

---

### Task 3: Integrate Board Context into Workspace Context

Replace Google Tasks with board tasks in `workspace-context.ts`. Add meetings and conversations.

**Files:**
- Modify: `src/lib/google/workspace-context.ts`

**Step 1: Update WorkspaceSnapshot interface**

At the top of `workspace-context.ts`, change the snapshot interface:

```typescript
// Replace lines 27-35
export interface WorkspaceSnapshot {
  unreadCount: number;
  emailIds: string[] | null;
  nextMeetingId: string | null;
  nextMeetingTime: string | null;
  // Board tasks (replaces Google Tasks)
  boardTaskCount: number | null;
  boardOverdueCount: number | null;
  boardTaskIds: string[] | null;
  // Meeting + conversation awareness
  unresolvedMeetingActions: number | null;
  activeConversationThreads: number | null;
  timestamp: number;
}
```

**Step 2: Update buildWorkspaceContext function**

Replace the `listTasks` import with board context import:

```typescript
// Replace line 4:
// import { listTasks } from "./tasks";
// Add:
import { buildBoardContext, buildMeetingContext, buildConversationContextSummary } from "@/lib/board/context";
```

Update the `Promise.allSettled` block and context building:

Replace lines 68-75 (the allSettled call) with:

```typescript
  const [emailResult, calendarResult, boardResult, driveResult, unreadResult, meetingResult, conversationResult] =
    await Promise.allSettled([
      listEmails(userId, { maxResults: 10 }),
      listEvents(userId, { maxResults: 10 }),
      buildBoardContext(userId),
      listFiles(userId, { maxResults: 5, orderBy: "modifiedTime desc" }),
      getUnreadCount(userId),
      buildMeetingContext(userId),
      buildConversationContextSummary(userId),
    ]);
```

Update the snapshot initialization (replace lines 77-88):

```typescript
  const snapshot: WorkspaceSnapshot = {
    unreadCount: unreadResult.status === "fulfilled" ? unreadResult.value : 0,
    emailIds:
      emailResult.status === "fulfilled"
        ? emailResult.value.map((e) => e.id).filter((id): id is string => !!id)
        : null,
    nextMeetingId: null,
    nextMeetingTime: null,
    boardTaskCount:
      boardResult.status === "fulfilled" ? boardResult.value.taskCount : null,
    boardOverdueCount:
      boardResult.status === "fulfilled" ? boardResult.value.overdueCount : null,
    boardTaskIds:
      boardResult.status === "fulfilled" ? boardResult.value.taskIds : null,
    unresolvedMeetingActions:
      meetingResult.status === "fulfilled" ? meetingResult.value.unresolvedActions : null,
    activeConversationThreads:
      conversationResult.status === "fulfilled" ? conversationResult.value.activeThreadCount : null,
    timestamp: Date.now(),
  };
```

Replace the Google Tasks section (lines 138-155) with board tasks:

```typescript
  // Board tasks (replaces Google Tasks)
  if (boardResult.status === "fulfilled" && boardResult.value.contextXml) {
    parts.push(boardResult.value.contextXml);
  }

  // Meeting context
  if (meetingResult.status === "fulfilled" && meetingResult.value.contextXml) {
    parts.push(meetingResult.value.contextXml);
  }

  // Conversation context
  if (conversationResult.status === "fulfilled" && conversationResult.value.contextXml) {
    parts.push(conversationResult.value.contextXml);
  }
```

**Step 3: Update briefing snapshot diff**

In `src/app/api/ai/briefing/route.ts`, update `hasSnapshotChanged` (lines 43-63) to use new fields:

```typescript
function hasSnapshotChanged(
  prev: WorkspaceSnapshot | undefined,
  curr: WorkspaceSnapshot
): boolean {
  if (!prev) return true;
  if (prev.unreadCount !== curr.unreadCount) return true;
  if (prev.nextMeetingId !== curr.nextMeetingId) return true;
  // Board tasks (replaces Google Tasks diff)
  if (prev.boardOverdueCount !== null && curr.boardOverdueCount !== null &&
      prev.boardOverdueCount !== curr.boardOverdueCount) return true;
  if (prev.boardTaskCount !== null && curr.boardTaskCount !== null &&
      prev.boardTaskCount !== curr.boardTaskCount) return true;
  if (prev.emailIds !== null && curr.emailIds !== null) {
    if (prev.emailIds.length !== curr.emailIds.length) return true;
    if (prev.emailIds.some((id, i) => curr.emailIds![i] !== id)) return true;
  }
  if (prev.boardTaskIds !== null && curr.boardTaskIds !== null) {
    if (prev.boardTaskIds.length !== curr.boardTaskIds.length) return true;
    if (prev.boardTaskIds.some((id, i) => curr.boardTaskIds![i] !== id)) return true;
  }
  // Meeting actions changed
  if (prev.unresolvedMeetingActions !== null && curr.unresolvedMeetingActions !== null &&
      prev.unresolvedMeetingActions !== curr.unresolvedMeetingActions) return true;
  return false;
}
```

**Step 4: Build to verify**

Run: `npx next build`
Expected: Build succeeds with no type errors

**Step 5: Commit**

```bash
git add src/lib/google/workspace-context.ts src/app/api/ai/briefing/route.ts
git commit -m "feat: replace Google Tasks with board tasks in workspace context"
```

---

### Task 4: Board Task Tool Declarations

Add 7 new board task tool declarations to `tools.ts`, replacing the 6 Google Tasks tools.

**Files:**
- Modify: `src/lib/ai/tools.ts` (lines 306-433: remove Google Tasks declarations)

**Step 1: Remove Google Tasks tool declarations**

Delete the 6 Google Tasks function declarations (lines 306-433 in `tools.ts`, from `// ── Google Tasks ──` through `list_task_lists`).

**Step 2: Add Board Task tool declarations**

Insert in place of the deleted section:

```typescript
    // ── Board Tasks ──────────────────────────────────────────────
    {
      name: "create_board_task",
      description:
        "Create a new task on a kanban board. Use when the user asks to add a task, to-do, or work item. If no boardId specified, uses the user's personal board.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Task title.",
          },
          description: {
            type: SchemaType.STRING,
            description: "Task description in markdown (optional).",
          },
          boardId: {
            type: SchemaType.STRING,
            description: "Board ID to create the task on. Omit to use the user's personal board.",
          },
          columnId: {
            type: SchemaType.STRING,
            description: "Column ID to place the task in. Defaults to the first column (To Do).",
          },
          priority: {
            type: SchemaType.STRING,
            description: "Priority: 'urgent', 'high', 'medium', 'low', or 'none'. Default: 'none'.",
          },
          assigneeId: {
            type: SchemaType.STRING,
            description: "User ID to assign the task to (optional).",
          },
          dueDate: {
            type: SchemaType.STRING,
            description: "Due date in ISO 8601 format (optional).",
          },
          labels: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Label IDs to apply (optional).",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "update_board_task",
      description:
        "Update an existing board task's title, description, priority, due date, or labels.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: {
            type: SchemaType.STRING,
            description: "The board task ID to update.",
          },
          title: { type: SchemaType.STRING, description: "New title (optional)." },
          description: { type: SchemaType.STRING, description: "New description (optional)." },
          priority: { type: SchemaType.STRING, description: "New priority (optional)." },
          dueDate: { type: SchemaType.STRING, description: "New due date in ISO 8601 (optional)." },
          labels: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "New label IDs (optional).",
          },
        },
        required: ["taskId"],
      },
    },
    {
      name: "move_board_task",
      description: "Move a board task to a different column (change status). Use when user says to move, complete, or change status of a task.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID to move." },
          columnId: { type: SchemaType.STRING, description: "Target column ID." },
        },
        required: ["taskId", "columnId"],
      },
    },
    {
      name: "assign_board_task",
      description: "Assign or reassign a board task to a user.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID." },
          assigneeId: { type: SchemaType.STRING, description: "User ID to assign to." },
        },
        required: ["taskId", "assigneeId"],
      },
    },
    {
      name: "delete_board_task",
      description: "Delete a board task permanently.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID to delete." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "list_board_tasks",
      description:
        "List board tasks with optional filters. Use to check tasks on a board, find overdue items, or see what's assigned to someone.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          boardId: { type: SchemaType.STRING, description: "Filter by board ID (optional — returns tasks across all user's boards if omitted)." },
          assigneeId: { type: SchemaType.STRING, description: "Filter by assignee user ID (optional)." },
          priority: { type: SchemaType.STRING, description: "Filter by priority: 'urgent', 'high', 'medium', 'low' (optional)." },
          columnId: { type: SchemaType.STRING, description: "Filter by column/status (optional)." },
          overdueOnly: { type: SchemaType.BOOLEAN, description: "Only return overdue tasks (optional)." },
          limit: { type: SchemaType.NUMBER, description: "Max results (default: 20)." },
        },
        required: [],
      },
    },
    {
      name: "search_board_tasks",
      description: "Search board tasks by text across titles and descriptions.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: "Search query text." },
          boardId: { type: SchemaType.STRING, description: "Limit search to a specific board (optional)." },
        },
        required: ["query"],
      },
    },
```

**Step 3: Build to verify declarations compile**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: replace Google Tasks tool declarations with board task tools"
```

---

### Task 5: Cross-Domain Tool Declarations

Add 8 cross-domain tools to `tools.ts`.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add after board task declarations, before Drive section)

**Step 1: Add cross-domain tool declarations**

Insert after the `search_board_tasks` declaration:

```typescript
    // ── Cross-Domain Tools ───────────────────────────────────────
    {
      name: "create_task_from_meeting",
      description:
        "Convert MoM action items from a meeting into board tasks. Creates tasks linked back to the meeting with attendees as collaborators.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          meetingId: { type: SchemaType.STRING, description: "The meeting ID to create tasks from." },
          actionItemIndex: { type: SchemaType.NUMBER, description: "Specific action item index (0-based). Omit to create tasks for ALL action items." },
          boardId: { type: SchemaType.STRING, description: "Target board ID (defaults to personal board)." },
        },
        required: ["meetingId"],
      },
    },
    {
      name: "create_task_from_email",
      description:
        "Create a board task from an email, linking the email to the task for reference.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          emailId: { type: SchemaType.STRING, description: "Gmail message ID to create task from." },
          title: { type: SchemaType.STRING, description: "Task title (extracted from email subject if omitted)." },
          boardId: { type: SchemaType.STRING, description: "Target board ID (defaults to personal board)." },
          priority: { type: SchemaType.STRING, description: "Priority level (optional)." },
        },
        required: ["emailId"],
      },
    },
    {
      name: "create_task_from_chat",
      description:
        "Create a board task from a chat conversation message, linking back to the conversation.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          conversationId: { type: SchemaType.STRING, description: "Conversation ID." },
          messageId: { type: SchemaType.STRING, description: "Specific message ID to extract task from (optional)." },
          title: { type: SchemaType.STRING, description: "Task title." },
          boardId: { type: SchemaType.STRING, description: "Target board ID (defaults to conversation board if exists, else personal)." },
        },
        required: ["conversationId", "title"],
      },
    },
    {
      name: "schedule_meeting_for_task",
      description:
        "Schedule a Yoodle meeting related to a board task. Pre-fills with task title, assignee and collaborators as participants.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
          duration: { type: SchemaType.NUMBER, description: "Meeting duration in minutes (default: 30)." },
          scheduledAt: { type: SchemaType.STRING, description: "When to schedule in ISO 8601 (optional — if omitted, AI picks next free slot)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "link_doc_to_task",
      description:
        "Attach a Google Drive document to a board task. Search Drive by query or provide a direct document ID.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
          query: { type: SchemaType.STRING, description: "Search query to find the document in Drive (optional if googleDocId provided)." },
          googleDocId: { type: SchemaType.STRING, description: "Direct Google Doc/Drive file ID (optional if query provided)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "link_meeting_to_task",
      description:
        "Link an existing Yoodle meeting to a board task for tracking.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
          meetingId: { type: SchemaType.STRING, description: "The meeting ID to link." },
        },
        required: ["taskId", "meetingId"],
      },
    },
    {
      name: "generate_subtasks",
      description:
        "AI-generate a subtask breakdown for a board task based on its title and description.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID to generate subtasks for." },
          count: { type: SchemaType.NUMBER, description: "Suggested number of subtasks (3-10, default: 5)." },
        },
        required: ["taskId"],
      },
    },
    {
      name: "get_task_context",
      description:
        "Get deep context about a board task including linked meeting status, documents, emails, and activity log. Use before answering questions about a specific task.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The board task ID." },
        },
        required: ["taskId"],
      },
    },
```

**Step 2: Update propose_action description**

Update the `propose_action` tool's `actionType` description (line 759) to include new board task types:

```typescript
          description:
            "The tool that would be called: 'send_email', 'reply_to_email', 'create_yoodle_meeting', 'create_calendar_event', 'update_calendar_event', 'delete_calendar_event', 'create_board_task', 'update_board_task', 'move_board_task', 'assign_board_task', 'delete_board_task', 'create_task_from_meeting', 'create_task_from_email', 'create_task_from_chat', 'schedule_meeting_for_task', 'link_doc_to_task', 'link_meeting_to_task', 'generate_subtasks', 'append_to_doc', 'find_replace_in_doc', 'write_sheet', 'append_to_sheet', 'clear_sheet_range'.",
```

**Step 3: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add 8 cross-domain AI tool declarations"
```

---

### Task 6: Board Task Tool Executors

Implement the `executeWorkspaceTool` cases for the 7 board task tools.

**Files:**
- Create: `src/lib/board/tools.ts`
- Modify: `src/lib/ai/tools.ts` (add import + switch cases)

**Step 1: Create board tools module**

```typescript
// src/lib/board/tools.ts
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import { createLogger } from "@/lib/infra/logger";
import { nanoid } from "nanoid";
import type { ToolResult } from "@/lib/ai/tools";

const log = createLogger("board:tools");

/** Get or auto-create user's personal board */
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

export async function createBoardTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const boardId = args.boardId as string | undefined;
  const board = boardId
    ? await Board.findById(boardId)
    : await getPersonalBoard(userId);

  if (!board) return { success: false, summary: "Board not found." };

  const columnId = (args.columnId as string) || board.columns[0]?.id;
  if (!columnId) return { success: false, summary: "Board has no columns." };

  // Get next position in column
  const lastTask = await Task.findOne({ boardId: board._id, columnId })
    .sort({ position: -1 })
    .lean();
  const position = (lastTask?.position ?? 0) + 1;

  const task = await Task.create({
    boardId: board._id,
    columnId,
    position,
    title: args.title as string,
    description: args.description as string | undefined,
    priority: (args.priority as string) || "none",
    creatorId: userId,
    assigneeId: args.assigneeId as string | undefined,
    dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
    labels: (args.labels as string[]) || [],
    subtasks: [],
    linkedDocs: [],
    linkedEmails: [],
    collaborators: [],
    source: { type: "ai" },
  });

  return {
    success: true,
    summary: `Created task "${task.title}" on board "${board.title}"${task.dueDate ? ` (due: ${task.dueDate.toISOString().split("T")[0]})` : ""}`,
    data: { taskId: task._id.toString(), boardId: board._id.toString(), title: task.title },
  };
}

export async function updateBoardTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };

  if (args.title) task.title = args.title as string;
  if (args.description !== undefined) task.description = args.description as string;
  if (args.priority) task.priority = args.priority as string;
  if (args.dueDate) task.dueDate = new Date(args.dueDate as string);
  if (args.labels) task.labels = args.labels as string[];

  await task.save();
  return {
    success: true,
    summary: `Updated task "${task.title}"`,
    data: { taskId: task._id.toString(), title: task.title },
  };
}

export async function moveBoardTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };

  const board = await Board.findById(task.boardId);
  const targetCol = board?.columns?.find(
    (c: { id: string; title: string }) => c.id === (args.columnId as string)
  );
  if (!targetCol) return { success: false, summary: "Target column not found." };

  // Get next position in target column
  const lastInCol = await Task.findOne({
    boardId: task.boardId,
    columnId: targetCol.id,
  }).sort({ position: -1 }).lean();

  task.columnId = targetCol.id;
  task.position = (lastInCol?.position ?? 0) + 1;

  // Mark completed if moved to "Done" column
  if (targetCol.title === "Done" && !task.completedAt) {
    task.completedAt = new Date();
  } else if (targetCol.title !== "Done" && task.completedAt) {
    task.completedAt = undefined;
  }

  await task.save();
  return {
    success: true,
    summary: `Moved "${task.title}" to "${targetCol.title}"`,
    data: { taskId: task._id.toString(), column: targetCol.title },
  };
}

export async function assignBoardTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findByIdAndUpdate(
    args.taskId as string,
    { $set: { assigneeId: args.assigneeId as string } },
    { new: true }
  );
  if (!task) return { success: false, summary: "Task not found." };
  return {
    success: true,
    summary: `Assigned "${task.title}" to user ${args.assigneeId}`,
    data: { taskId: task._id.toString() },
  };
}

export async function deleteBoardTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();
  const task = await Task.findByIdAndDelete(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };
  return {
    success: true,
    summary: `Deleted task "${task.title}"`,
  };
}

export async function listBoardTasks(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const filter: Record<string, unknown> = { completedAt: null };

  if (args.boardId) {
    filter.boardId = args.boardId;
  } else {
    // All user's boards
    const boards = await Board.find({
      $or: [{ ownerId: userId }, { "members.userId": userId }],
    }).lean();
    filter.boardId = { $in: boards.map((b) => b._id) };
  }

  if (args.assigneeId) filter.assigneeId = args.assigneeId;
  if (args.priority) filter.priority = args.priority;
  if (args.columnId) filter.columnId = args.columnId;
  if (args.overdueOnly) filter.dueDate = { $lt: new Date() };

  const limit = Math.min((args.limit as number) || 20, 50);
  const tasks = await Task.find(filter)
    .sort({ dueDate: 1, priority: -1 })
    .limit(limit)
    .populate("assigneeId", "displayName name")
    .lean();

  return {
    success: true,
    summary: `Found ${tasks.length} task(s)`,
    data: tasks.map((t) => ({
      id: t._id.toString(),
      title: t.title,
      priority: t.priority,
      column: t.columnId,
      dueDate: t.dueDate,
      assignee: (t.assigneeId as { displayName?: string; name?: string } | null)?.displayName || null,
    })),
  };
}

export async function searchBoardTasks(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const boards = await Board.find({
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  }).lean();

  const filter: Record<string, unknown> = {
    boardId: args.boardId ? args.boardId : { $in: boards.map((b) => b._id) },
    $text: { $search: args.query as string },
  };

  const tasks = await Task.find(filter)
    .limit(15)
    .populate("assigneeId", "displayName name")
    .lean();

  return {
    success: true,
    summary: `Found ${tasks.length} task(s) matching "${args.query}"`,
    data: tasks.map((t) => ({
      id: t._id.toString(),
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
  };
}
```

**Step 2: Wire into executeWorkspaceTool**

In `src/lib/ai/tools.ts`, add import at top:

```typescript
import {
  createBoardTask, updateBoardTask, moveBoardTask,
  assignBoardTask, deleteBoardTask, listBoardTasks, searchBoardTasks,
} from "@/lib/board/tools";
```

Remove the Google Tasks import (line 8):
```typescript
// DELETE: import { createTask, completeTask, listTasks, listTaskLists, updateTask, deleteTask } from "@/lib/google/tasks";
```

Replace the Google Tasks switch cases (lines 1012-1096) with:

```typescript
      // ── Board Tasks ─────────────────────────────────────────────
      case "create_board_task":
        return createBoardTask(userId, args);
      case "update_board_task":
        return updateBoardTask(userId, args);
      case "move_board_task":
        return moveBoardTask(userId, args);
      case "assign_board_task":
        return assignBoardTask(userId, args);
      case "delete_board_task":
        return deleteBoardTask(userId, args);
      case "list_board_tasks":
        return listBoardTasks(userId, args);
      case "search_board_tasks":
        return searchBoardTasks(userId, args);
```

**Step 3: Update confirm whitelist**

In `src/app/api/ai/action/confirm/route.ts`, replace Google Tasks entries in `ALLOWED_ACTION_TYPES`:

```typescript
const ALLOWED_ACTION_TYPES = new Set([
  "send_email", "search_emails", "list_emails", "get_unread_count",
  "mark_email_read", "get_email", "reply_to_email",
  "create_calendar_event", "list_calendar_events", "update_calendar_event", "delete_calendar_event",
  // Board tasks (replaces Google Tasks)
  "create_board_task", "update_board_task", "move_board_task",
  "assign_board_task", "delete_board_task", "list_board_tasks", "search_board_tasks",
  // Cross-domain tools
  "create_task_from_meeting", "create_task_from_email", "create_task_from_chat",
  "schedule_meeting_for_task", "link_doc_to_task", "link_meeting_to_task",
  "generate_subtasks", "get_task_context",
  // Drive, Docs, Sheets
  "search_drive_files", "list_drive_files", "create_google_doc",
  "read_doc", "append_to_doc", "find_replace_in_doc",
  "read_sheet", "write_sheet", "append_to_sheet", "create_spreadsheet", "clear_sheet_range",
  "search_contacts", "save_memory", "create_yoodle_meeting", "propose_action",
]);
```

**Step 4: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/board/tools.ts src/lib/ai/tools.ts src/app/api/ai/action/confirm/route.ts
git commit -m "feat: implement board task tool executors, wire into AI pipeline"
```

---

### Task 7: Cross-Domain Tool Executors

Implement the 8 cross-domain tool execution functions.

**Files:**
- Create: `src/lib/board/cross-domain.ts`
- Modify: `src/lib/ai/tools.ts` (add import + switch cases)

**Step 1: Create cross-domain tools module**

```typescript
// src/lib/board/cross-domain.ts
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import TaskComment from "@/lib/infra/db/models/task-comment";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user";
import { getEmail } from "@/lib/google/gmail";
import { searchFiles } from "@/lib/google/drive";
import { nanoid } from "nanoid";
import { getPersonalBoard } from "./tools";
import { createLogger } from "@/lib/infra/logger";
import type { ToolResult } from "@/lib/ai/tools";

const log = createLogger("board:cross-domain");

export async function createTaskFromMeeting(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const meeting = await Meeting.findById(args.meetingId as string)
    .populate("participants.userId", "displayName name _id")
    .lean();
  if (!meeting) return { success: false, summary: "Meeting not found." };
  if (!meeting.mom?.actionItems?.length) {
    return { success: false, summary: "No MoM action items found for this meeting." };
  }

  const boardId = args.boardId as string | undefined;
  const board = boardId
    ? await Board.findById(boardId)
    : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };

  const firstColumnId = board.columns[0]?.id;
  if (!firstColumnId) return { success: false, summary: "Board has no columns." };

  const actionItemIndex = args.actionItemIndex as number | undefined;
  const items = actionItemIndex !== undefined
    ? [meeting.mom.actionItems[actionItemIndex]].filter(Boolean)
    : meeting.mom.actionItems;

  if (items.length === 0) return { success: false, summary: "Action item not found at that index." };

  // Resolve owner names to user IDs
  const participantUsers = meeting.participants
    ?.map((p: { userId: { _id: string; displayName?: string; name?: string } | null }) => p.userId)
    .filter(Boolean) || [];

  const createdTasks: string[] = [];

  for (const item of items) {
    // Try to match owner name to a participant
    const ownerUser = participantUsers.find(
      (u: { displayName?: string; name?: string }) =>
        u.displayName?.toLowerCase().includes(item.owner?.toLowerCase() || "") ||
        u.name?.toLowerCase().includes(item.owner?.toLowerCase() || "")
    );

    // Parse due date
    let dueDate: Date | undefined;
    if (item.due && item.due !== "TBD") {
      const parsed = new Date(item.due);
      if (!isNaN(parsed.getTime())) dueDate = parsed;
    }

    const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId })
      .sort({ position: -1 }).lean();

    const task = await Task.create({
      boardId: board._id,
      columnId: firstColumnId,
      position: (lastTask?.position ?? 0) + 1,
      title: item.task,
      priority: "medium",
      creatorId: userId,
      assigneeId: ownerUser?._id || undefined,
      dueDate,
      meetingId: meeting._id,
      collaborators: participantUsers.map((u: { _id: string }) => u._id),
      source: { type: "meeting-mom", sourceId: meeting._id.toString() },
      subtasks: [],
      linkedDocs: [],
      linkedEmails: [],
      labels: [],
    });

    createdTasks.push(task.title);
  }

  return {
    success: true,
    summary: `Created ${createdTasks.length} task(s) from meeting "${meeting.title}": ${createdTasks.join(", ")}`,
    data: { count: createdTasks.length, tasks: createdTasks },
  };
}

export async function createTaskFromEmail(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const email = await getEmail(userId, args.emailId as string);
  if (!email) return { success: false, summary: "Email not found." };

  const board = args.boardId
    ? await Board.findById(args.boardId as string)
    : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };

  const firstColumnId = board.columns[0]?.id;
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId })
    .sort({ position: -1 }).lean();

  const title = (args.title as string) || email.subject || "Task from email";

  const task = await Task.create({
    boardId: board._id,
    columnId: firstColumnId,
    position: (lastTask?.position ?? 0) + 1,
    title,
    description: `From email: "${email.subject}" by ${email.from}`,
    priority: (args.priority as string) || "medium",
    creatorId: userId,
    source: { type: "email", sourceId: args.emailId as string },
    linkedEmails: [{
      gmailId: email.id,
      subject: email.subject || "",
      from: email.from || "",
    }],
    subtasks: [],
    linkedDocs: [],
    collaborators: [],
    labels: [],
  });

  return {
    success: true,
    summary: `Created task "${title}" from email by ${email.from}`,
    data: { taskId: task._id.toString(), title },
  };
}

export async function createTaskFromChat(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  // Check if conversation has a linked board
  const conversationId = args.conversationId as string;
  let boardId = args.boardId as string | undefined;

  if (!boardId) {
    const linkedBoard = await Board.findOne({ conversationId });
    boardId = linkedBoard?._id?.toString();
  }

  const board = boardId
    ? await Board.findById(boardId)
    : await getPersonalBoard(userId);
  if (!board) return { success: false, summary: "Board not found." };

  const firstColumnId = board.columns[0]?.id;
  const lastTask = await Task.findOne({ boardId: board._id, columnId: firstColumnId })
    .sort({ position: -1 }).lean();

  const task = await Task.create({
    boardId: board._id,
    columnId: firstColumnId,
    position: (lastTask?.position ?? 0) + 1,
    title: args.title as string,
    priority: "medium",
    creatorId: userId,
    source: { type: "chat", sourceId: conversationId },
    subtasks: [],
    linkedDocs: [],
    linkedEmails: [],
    collaborators: [],
    labels: [],
  });

  return {
    success: true,
    summary: `Created task "${task.title}" from chat`,
    data: { taskId: task._id.toString(), title: task.title },
  };
}

export async function scheduleMeetingForTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const task = await Task.findById(args.taskId as string)
    .populate("assigneeId", "email displayName")
    .populate("collaborators", "email displayName")
    .lean();
  if (!task) return { success: false, summary: "Task not found." };

  // Collect attendee emails from assignee + collaborators
  const attendeeEmails: string[] = [];
  const assignee = task.assigneeId as { email?: string } | null;
  if (assignee?.email) attendeeEmails.push(assignee.email);
  const collabs = (task.collaborators || []) as { email?: string }[];
  for (const c of collabs) {
    if (c.email && !attendeeEmails.includes(c.email)) attendeeEmails.push(c.email);
  }

  // Return a propose_action-style result — actual meeting creation is done
  // by calling create_yoodle_meeting through the normal tool pipeline
  return {
    success: true,
    summary: `Ready to schedule meeting for task "${task.title}" with ${attendeeEmails.length} participant(s)`,
    data: {
      suggestedTitle: task.title,
      suggestedAttendees: attendeeEmails,
      suggestedDuration: (args.duration as number) || 30,
      scheduledAt: args.scheduledAt || null,
      taskId: task._id.toString(),
    },
  };
}

export async function linkDocToTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const taskId = args.taskId as string;
  const task = await Task.findById(taskId);
  if (!task) return { success: false, summary: "Task not found." };

  let docId = args.googleDocId as string | undefined;
  let docName = "";
  let docUrl = "";
  let docType: "doc" | "sheet" | "slide" | "pdf" | "file" = "file";

  if (!docId && args.query) {
    // Search Drive
    const files = await searchFiles(userId, args.query as string, 1);
    if (files.length === 0) return { success: false, summary: `No Drive files found for "${args.query}"` };
    const file = files[0];
    docId = file.id;
    docName = file.name;
    docUrl = file.webViewLink || "";
    if (file.mimeType?.includes("document")) docType = "doc";
    else if (file.mimeType?.includes("spreadsheet")) docType = "sheet";
    else if (file.mimeType?.includes("presentation")) docType = "slide";
    else if (file.mimeType?.includes("pdf")) docType = "pdf";
  }

  if (!docId) return { success: false, summary: "No document ID or search query provided." };

  // Add to linkedDocs if not already linked
  const alreadyLinked = task.linkedDocs?.some(
    (d: { googleDocId: string }) => d.googleDocId === docId
  );
  if (alreadyLinked) return { success: true, summary: `Document already linked to "${task.title}"` };

  task.linkedDocs = [
    ...(task.linkedDocs || []),
    { googleDocId: docId, title: docName, url: docUrl, type: docType },
  ];
  await task.save();

  return {
    success: true,
    summary: `Linked "${docName || docId}" to task "${task.title}"`,
    data: { taskId, docId },
  };
}

export async function linkMeetingToTask(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const task = await Task.findById(args.taskId as string);
  if (!task) return { success: false, summary: "Task not found." };

  const meeting = await Meeting.findById(args.meetingId as string);
  if (!meeting) return { success: false, summary: "Meeting not found." };

  task.meetingId = meeting._id;
  await task.save();

  return {
    success: true,
    summary: `Linked meeting "${meeting.title}" to task "${task.title}"`,
    data: { taskId: task._id.toString(), meetingId: meeting._id.toString() },
  };
}

export async function generateSubtasks(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const task = await Task.findById(args.taskId as string).lean();
  if (!task) return { success: false, summary: "Task not found." };

  const count = Math.min(Math.max((args.count as number) || 5, 3), 10);

  // Use Gemini to generate subtasks
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, summary: "AI not configured." };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  });

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{
        text: `Break down this task into ${count} concrete, actionable subtasks. Return ONLY a JSON array of strings, no explanation.

Task: "${task.title}"
${task.description ? `Description: ${task.description}` : ""}

Example output: ["Subtask 1", "Subtask 2", "Subtask 3"]`,
      }],
    }],
  });

  const text = result.response.text().trim();
  let subtasks: string[];
  try {
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    subtasks = match ? JSON.parse(match[0]) : [];
  } catch {
    subtasks = text.split("\n").filter(Boolean).map((s) => s.replace(/^[\d\-.*]+\s*/, "").trim());
  }

  if (subtasks.length === 0) return { success: false, summary: "Could not generate subtasks." };

  // Add to task
  const newSubtasks = subtasks.map((s) => ({
    id: nanoid(8),
    title: s,
    done: false,
  }));

  await Task.findByIdAndUpdate(task._id, {
    $push: { subtasks: { $each: newSubtasks } },
  });

  return {
    success: true,
    summary: `Generated ${newSubtasks.length} subtasks for "${task.title}": ${subtasks.join(", ")}`,
    data: { subtasks: newSubtasks },
  };
}

export async function getTaskContext(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  await connectDB();

  const task = await Task.findById(args.taskId as string)
    .populate("assigneeId", "displayName name email")
    .populate("collaborators", "displayName name")
    .populate("boardId", "title")
    .lean();
  if (!task) return { success: false, summary: "Task not found." };

  // Get linked meeting info
  let meetingInfo = null;
  if (task.meetingId) {
    const meeting = await Meeting.findById(task.meetingId).lean();
    if (meeting) {
      meetingInfo = {
        title: meeting.title,
        status: meeting.status,
        scheduledAt: meeting.scheduledAt,
        hasMom: !!meeting.mom?.summary,
        momSummary: meeting.mom?.summary || null,
      };
    }
  }

  // Get recent comments/activity
  const comments = await TaskComment.find({ taskId: task._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("authorId", "displayName name")
    .lean();

  const assignee = task.assigneeId as { displayName?: string; name?: string; email?: string } | null;
  const board = task.boardId as { title?: string } | null;

  return {
    success: true,
    summary: `Task "${task.title}" — ${task.priority} priority, assignee: ${assignee?.displayName || "unassigned"}`,
    data: {
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      priority: task.priority,
      column: task.columnId,
      board: board?.title,
      assignee: assignee?.displayName || assignee?.name || null,
      dueDate: task.dueDate,
      subtasks: task.subtasks?.map((s: { title: string; done: boolean }) => ({
        title: s.title,
        done: s.done,
      })),
      linkedDocs: task.linkedDocs,
      linkedEmails: task.linkedEmails,
      meeting: meetingInfo,
      recentActivity: comments.map((c) => ({
        type: c.type,
        content: c.content,
        author: (c.authorId as { displayName?: string } | null)?.displayName || "Unknown",
        at: c.createdAt,
      })),
      source: task.source,
    },
  };
}
```

**Step 2: Wire into executeWorkspaceTool**

In `src/lib/ai/tools.ts`, add import:

```typescript
import {
  createTaskFromMeeting, createTaskFromEmail, createTaskFromChat,
  scheduleMeetingForTask, linkDocToTask, linkMeetingToTask,
  generateSubtasks, getTaskContext,
} from "@/lib/board/cross-domain";
```

Add switch cases after the board task cases:

```typescript
      // ── Cross-Domain Tools ──────────────────────────────────────
      case "create_task_from_meeting":
        return createTaskFromMeeting(userId, args);
      case "create_task_from_email":
        return createTaskFromEmail(userId, args);
      case "create_task_from_chat":
        return createTaskFromChat(userId, args);
      case "schedule_meeting_for_task":
        return scheduleMeetingForTask(userId, args);
      case "link_doc_to_task":
        return linkDocToTask(userId, args);
      case "link_meeting_to_task":
        return linkMeetingToTask(userId, args);
      case "generate_subtasks":
        return generateSubtasks(userId, args);
      case "get_task_context":
        return getTaskContext(userId, args);
```

**Step 3: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/board/cross-domain.ts src/lib/ai/tools.ts
git commit -m "feat: implement 8 cross-domain AI tool executors"
```

---

### Task 8: Update System Prompts

Add board task intelligence, cross-domain chaining, and conversation board awareness to prompts.

**Files:**
- Modify: `src/lib/ai/prompts.ts`

**Step 1: Update ASSISTANT_CHAT prompt**

In `src/lib/ai/prompts.ts`, add to `ASSISTANT_CHAT` before the closing backtick (line 58). Find the line `- When user asks to "handle" something: chain actions (read → decide → propose action → wait for approval)` and insert after it:

```typescript
// After the existing "Proactive behavior:" section, add:

Board Task Intelligence:
- You have access to the user's kanban board tasks via <board-tasks> context. Reference them proactively.
- When user mentions a topic, check if related tasks exist on their boards.
- When listing work priorities: overdue → due today → high priority → in progress.
- When a meeting has linked tasks, always mention their status in prep.
- When an email relates to a known task, mention the connection.
- After meetings with MoM, offer to create board tasks from action items using create_task_from_meeting.
- When asked "what should I work on?", cross-reference tasks + calendar + emails for a smart prioritized plan.

Cross-Domain Chaining — always think across domains:
- Task created → offer to schedule a meeting if it needs discussion (schedule_meeting_for_task)
- Meeting ended with MoM → offer to create board tasks from action items (create_task_from_meeting)
- Email with action items → offer to create task with email link (create_task_from_email)
- Chat action item detected → offer to add to conversation board (create_task_from_chat)
- Task completed → if meeting-linked, mention it
- Task with due date but no calendar block → offer to block time (create_calendar_event)
- When attaching docs → use link_doc_to_task to formally link them
- When a complex task needs breakdown → offer generate_subtasks

Conversation Board Awareness (in group chats):
- In group chats with linked boards, reference actual task data when project status is asked.
- When action items emerge in chat, offer to add them to the board.
- When tasks are completed, mention it naturally in context.
```

**Step 2: Update BRIEFING prompt**

In `src/lib/ai/prompts.ts`, update `BRIEFING` (line 60). Add after the existing rules:

```typescript
// Add to BRIEFING after "Keep the whole briefing under 200 words":

Board task integration:
- Include overdue and due-today board tasks — name the top 3 most urgent
- If a meeting has linked tasks, show their status (e.g., "4 linked tasks: 2 done, 1 in progress, 1 overdue")
- If recent meetings have untracked MoM action items (no board tasks created), flag it
- If a shared board has significant overdue items, mention it
- Replace any reference to "Google Tasks" with board task data from <board-tasks>
```

**Step 3: Update Google Tasks references in prompt**

In the `ASSISTANT_CHAT` prompt, replace `- **Google Tasks**: List task lists, list/create/update/complete/delete tasks` (line 30) with:

```
- **Board Tasks**: Create, update, move, assign, delete, list, and search kanban board tasks. Link tasks to meetings, emails, docs, and chats.
```

And update the write operations section to include board task tools in the propose_action list.

**Step 4: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/ai/prompts.ts
git commit -m "feat: update system prompts with board task intelligence and cross-domain chaining"
```

---

### Task 9: Update Chat Agent with Board Context

Expand the chat agent to inject board and meeting context when processing conversations.

**Files:**
- Modify: `src/lib/chat/agent-tools.ts`
- Modify: `src/lib/chat/agent-processor.ts`

**Step 1: Add board task tool to agent-tools.ts**

In `src/lib/chat/agent-tools.ts`, add a new tool handler `check_board_tasks`:

After the existing tool imports, add:

```typescript
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
```

In the `executeToolPlan` function, add a handler for `check_board_tasks` alongside the existing tools:

```typescript
  if (tools.includes("check_board_tasks")) {
    promises.push(
      withTimeout(fetchBoardTasks(userId), TOOL_TIMEOUT_MS, "Board Tasks: Timed out fetching data.")
        .then((data) => { result.boardTasks = data; })
    );
  }
```

Add `boardTasks?: string` to the `GatheredData` interface.

Add the fetcher function:

```typescript
async function fetchBoardTasks(userId: string): Promise<string> {
  const boards = await Board.find({
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  }).lean();

  if (boards.length === 0) return "No boards found.";

  const boardIds = boards.map((b) => b._id);
  const tasks = await Task.find({
    boardId: { $in: boardIds },
    completedAt: null,
  })
    .sort({ dueDate: 1 })
    .limit(20)
    .populate("assigneeId", "displayName name")
    .lean();

  if (tasks.length === 0) return "No pending board tasks.";

  const boardMap = new Map(boards.map((b) => [b._id.toString(), b]));
  const now = new Date();

  const lines = tasks.map((t) => {
    const board = boardMap.get(t.boardId.toString());
    const col = board?.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
    const assignee = (t.assigneeId as { displayName?: string } | null)?.displayName || "Unassigned";
    const isOverdue = t.dueDate && new Date(t.dueDate) < now;
    const overdueTag = isOverdue ? " [OVERDUE]" : "";
    const dueStr = t.dueDate ? ` (due: ${new Date(t.dueDate).toISOString().split("T")[0]})` : "";
    return `- "${t.title}" [${col?.title || "?"}] ${t.priority} priority, assigned to ${assignee}${dueStr}${overdueTag}`;
  });

  return `Board tasks (${tasks.length} pending):\n${lines.join("\n")}`;
}
```

**Step 2: Update agent-processor.ts to inject board context for conversation boards**

In `agent-processor.ts`, in the section where context is built for the ANALYZE+DECIDE prompt, add board context injection. Find where `buildAnalyzeAndDecidePrompt` is called and add before it:

```typescript
// Check if conversation has a linked board
let boardContextStr = "";
const linkedBoard = await Board.findOne({ conversationId }).lean();
if (linkedBoard) {
  const boardTasks = await Task.find({ boardId: linkedBoard._id, completedAt: null })
    .sort({ dueDate: 1 })
    .limit(10)
    .populate("assigneeId", "displayName")
    .lean();
  const taskLines = boardTasks.map((t) => {
    const col = linkedBoard.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
    const assignee = (t.assigneeId as { displayName?: string } | null)?.displayName || "Unassigned";
    return `  - "${t.title}" [${col?.title}] ${t.priority}, ${assignee}`;
  });
  boardContextStr = `\n\nConversation Board: "${linkedBoard.title}" (${boardTasks.length} tasks)\n${taskLines.join("\n")}`;
}
```

Then append `boardContextStr` to the context summary passed to `buildAnalyzeAndDecidePrompt()`.

Add the imports at the top of `agent-processor.ts`:

```typescript
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
```

**Step 3: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/chat/agent-tools.ts src/lib/chat/agent-processor.ts
git commit -m "feat: expand chat agent with board task context and tools"
```

---

### Task 10: Update ChatBubble Tool Display

Add human-readable labels and icons for the 15 new tools in the chat UI.

**Files:**
- Modify: `src/components/ai/ChatBubble.tsx`

**Step 1: Update TOOL_DISPLAY map**

In `src/components/ai/ChatBubble.tsx`, find `TOOL_DISPLAY` (line 29) and replace the Tasks section + add new entries:

```typescript
  // Board Tasks (replaces Google Tasks)
  create_board_task: { label: "Creating task", icon: CheckSquare },
  update_board_task: { label: "Updating task", icon: CheckSquare },
  move_board_task: { label: "Moving task", icon: CheckSquare },
  assign_board_task: { label: "Assigning task", icon: CheckSquare },
  delete_board_task: { label: "Deleting task", icon: CheckSquare },
  list_board_tasks: { label: "Listing tasks", icon: CheckSquare },
  search_board_tasks: { label: "Searching tasks", icon: CheckSquare },
  // Cross-domain
  create_task_from_meeting: { label: "Creating task from meeting", icon: CheckSquare },
  create_task_from_email: { label: "Creating task from email", icon: Mail },
  create_task_from_chat: { label: "Creating task from chat", icon: CheckSquare },
  schedule_meeting_for_task: { label: "Scheduling meeting", icon: Calendar },
  link_doc_to_task: { label: "Linking document", icon: FileText },
  link_meeting_to_task: { label: "Linking meeting", icon: Calendar },
  generate_subtasks: { label: "Generating subtasks", icon: CheckSquare },
  get_task_context: { label: "Getting task context", icon: CheckSquare },
```

Remove old Google Tasks entries:
```typescript
  // DELETE these:
  // create_task, complete_task, update_task, delete_task, list_tasks, list_task_lists
```

**Step 2: Update ACTION_ICONS map**

Update `ACTION_ICONS` (line 204) similarly — replace old task entries:

```typescript
  // Board Tasks
  create_board_task: CheckSquare,
  update_board_task: CheckSquare,
  move_board_task: CheckSquare,
  assign_board_task: CheckSquare,
  delete_board_task: CheckSquare,
  // Cross-domain
  create_task_from_meeting: CheckSquare,
  create_task_from_email: Mail,
  create_task_from_chat: CheckSquare,
  schedule_meeting_for_task: Calendar,
  link_doc_to_task: FileText,
  link_meeting_to_task: Calendar,
  generate_subtasks: CheckSquare,
```

Remove old entries: `create_task`, `complete_task`, `update_task`, `delete_task`.

**Step 3: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/ai/ChatBubble.tsx
git commit -m "feat: update ChatBubble tool display for new board and cross-domain tools"
```

---

### Task 11: Replace MoM Google Tasks with Board Task Proposals

Modify MoM generation to propose board tasks instead of creating Google Tasks.

**Files:**
- Modify: `src/app/api/meetings/[meetingId]/mom/route.ts`

**Step 1: Remove Google Tasks fire-and-forget block**

Find the fire-and-forget block that creates Google Tasks after MoM is saved (approximately lines 235-271 in the MoM route). Delete or comment out the entire `// Create Google Tasks from action items` async block.

**Step 2: Replace with board task notification**

After the MoM is saved to the meeting document, add a new fire-and-forget block that posts a system message to the meeting's linked conversation suggesting board task creation:

```typescript
    // Post task creation suggestions to meeting chat (fire-and-forget)
    (async () => {
      try {
        const conversation = await Conversation.findOne({ meetingId: meeting._id });
        if (!conversation || !meeting.mom?.actionItems?.length) return;

        const actionCount = meeting.mom.actionItems.length;
        const itemList = meeting.mom.actionItems
          .map((item, i) => `${i + 1}. **${item.task}** → ${item.owner}${item.due !== "TBD" ? ` (due: ${item.due})` : ""}`)
          .join("\n");

        const content = `📋 **${actionCount} action item(s) from this meeting:**\n\n${itemList}\n\nSay "add these to the board" to create tasks, or ask me about any of them.`;

        const msg = await DirectMessage.create({
          conversationId: conversation._id,
          senderId: meeting.hostId,
          senderType: "agent",
          content,
          type: "agent",
          agentMeta: { forUserId: meeting.hostId },
        });

        await Conversation.updateOne(
          { _id: conversation._id },
          {
            $set: {
              lastMessageAt: msg.createdAt,
              lastMessagePreview: `📋 ${actionCount} action items from meeting`,
              lastMessageSenderId: meeting.hostId,
            },
          },
        );

        // Publish to Redis for real-time delivery
        const { getRedisClient } = await import("@/lib/infra/redis/client");
        const redis = getRedisClient();
        if (redis) {
          await redis.publish(
            `chat:${conversation._id}`,
            JSON.stringify({ type: "message", data: msg }),
          ).catch(() => {});
        }
      } catch (err) {
        log.warn({ err }, "failed to post MoM task suggestions to chat");
      }
    })();
```

Add imports at top if not already present:

```typescript
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
```

**Step 3: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/meetings/[meetingId]/mom/route.ts
git commit -m "feat: replace MoM Google Tasks with board task suggestions in chat"
```

---

### Task 12: Update Briefing Prompt and Metadata

Update the briefing endpoint to include board task metadata in the response.

**Files:**
- Modify: `src/app/api/ai/briefing/route.ts`

**Step 1: Update metadata in response**

In the briefing route, update the response metadata (lines 118-125):

```typescript
  return successResponse({
    briefing: briefingText,
    metadata: {
      unreadCount: snapshot.unreadCount,
      nextMeetingTime: snapshot.nextMeetingTime,
      boardTaskCount: snapshot.boardTaskCount,
      boardOverdueCount: snapshot.boardOverdueCount,
      unresolvedMeetingActions: snapshot.unresolvedMeetingActions,
    },
  });
```

**Step 2: Build to verify**

Run: `npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/ai/briefing/route.ts
git commit -m "feat: include board task metadata in briefing response"
```

---

### Task 13: Remove Google Tasks API Dependencies

Clean up unused Google Tasks imports and references.

**Files:**
- Modify: `src/lib/ai/tools.ts` (remove Google Tasks import)
- Modify: `src/lib/google/workspace-context.ts` (remove Google Tasks import)
- Modify: `src/lib/chat/agent-tools.ts` (replace Google Tasks with board tasks in fetchTasks)

**Step 1: Clean up imports**

In `src/lib/ai/tools.ts`, remove line 8:
```typescript
// DELETE: import { createTask, completeTask, listTasks, listTaskLists, updateTask, deleteTask } from "@/lib/google/tasks";
```

In `src/lib/google/workspace-context.ts`, remove line 4:
```typescript
// DELETE: import { listTasks } from "./tasks";
```

In `src/lib/chat/agent-tools.ts`, update the `fetchTasks` function to use board tasks instead of Google Tasks. Replace the import of `listTasks, listTaskLists` with the board task fetcher from Task 9.

**Step 2: Build to verify no broken imports**

Run: `npx next build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts src/lib/google/workspace-context.ts src/lib/chat/agent-tools.ts
git commit -m "refactor: remove Google Tasks dependencies from AI pipeline"
```

---

### Task 14: Build Verification & Smoke Test

Final verification that everything compiles and integrates.

**Step 1: Full build**

Run: `npx next build`
Expected: Build succeeds with exit code 0

**Step 2: Check for TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Verify file count**

Check that all expected files exist:

```bash
ls -la src/lib/board/context.ts src/lib/board/tools.ts src/lib/board/cross-domain.ts
```

Expected: All 3 new files exist

**Step 5: Final commit if any cleanup needed**

```bash
git add -A
git status
# Only commit if there are changes
git commit -m "chore: build verification and cleanup for AI integration layer"
```

---

## Summary of Changes

| Action | File | Description |
|--------|------|-------------|
| **Create** | `src/lib/board/context.ts` | Board, meeting, conversation context builders for AI |
| **Create** | `src/lib/board/tools.ts` | 7 board task tool executors |
| **Create** | `src/lib/board/cross-domain.ts` | 8 cross-domain tool executors |
| **Create** | `src/lib/board/__tests__/context.test.ts` | Tests for board context builder |
| **Modify** | `src/lib/google/workspace-context.ts` | Replace Google Tasks with board tasks, add meetings/conversations |
| **Modify** | `src/lib/ai/tools.ts` | Replace 6 Google Tasks tools with 15 new tools (7 board + 8 cross-domain) |
| **Modify** | `src/lib/ai/prompts.ts` | Add board task intelligence, cross-domain chaining to system prompts |
| **Modify** | `src/app/api/ai/action/confirm/route.ts` | Update action type whitelist |
| **Modify** | `src/app/api/ai/briefing/route.ts` | Update snapshot diff + response metadata |
| **Modify** | `src/lib/chat/agent-processor.ts` | Inject board context for conversation boards |
| **Modify** | `src/lib/chat/agent-tools.ts` | Add board task tool, replace Google Tasks fetch |
| **Modify** | `src/components/ai/ChatBubble.tsx` | Add tool display labels/icons for new tools |
| **Modify** | `src/app/api/meetings/[meetingId]/mom/route.ts` | Replace Google Tasks with board task chat suggestions |

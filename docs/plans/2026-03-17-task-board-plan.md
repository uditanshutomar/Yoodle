# Task Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a MongoDB-backed kanban task board with drag-and-drop, task detail drawer, and dashboard integration — replacing the current Google Tasks panel.

**Architecture:** MongoDB models (Board, Task, TaskComment) with Mongoose, RESTful API routes under `/api/boards/`, dnd-kit for drag-and-drop kanban UI, task detail slide-over panel. Personal boards auto-created per user. Existing Yoodle patterns used throughout (withHandler, Zod, successResponse, etc.)

**Tech Stack:** MongoDB/Mongoose, Next.js App Router API routes, Zod validation, @dnd-kit/core + @dnd-kit/sortable, React + Framer Motion + Tailwind CSS, Vitest for tests.

**Design Doc:** `docs/plans/2026-03-17-task-board-design.md`

---

## Task 1: Install dnd-kit Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Verify installation**

Run: `cat package.json | grep dnd-kit`
Expected: Three `@dnd-kit` entries in dependencies.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit/core, sortable, utilities"
```

---

## Task 2: Board MongoDB Model

**Files:**
- Create: `src/lib/infra/db/models/board.ts`
- Test: `src/lib/infra/db/models/__tests__/board.test.ts`

**Step 1: Write the model test**

```typescript
// src/lib/infra/db/models/__tests__/board.test.ts
import { describe, it, expect } from "vitest";

describe("Board model schema", () => {
  it("has correct collection name and required fields", async () => {
    const { default: Board } = await import("../board");
    const schema = Board.schema;

    expect(schema.path("title")).toBeDefined();
    expect(schema.path("ownerId")).toBeDefined();
    expect(schema.path("scope")).toBeDefined();
    expect(schema.path("members")).toBeDefined();
    expect(schema.path("columns")).toBeDefined();
    expect(schema.path("labels")).toBeDefined();
    expect((Board.collection as any).collectionName || Board.modelName).toBe("Board");
  });

  it("scope enum only allows personal and conversation", () => {
    const { default: Board } = await import("../board");
    const scopePath = Board.schema.path("scope") as any;
    expect(scopePath.enumValues).toEqual(["personal", "conversation"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/infra/db/models/__tests__/board.test.ts`
Expected: FAIL — module not found

**Step 3: Write the Board model**

```typescript
// src/lib/infra/db/models/board.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* ─── Interfaces ─── */

export interface IBoardMember {
  userId: Types.ObjectId;
  role: "owner" | "editor" | "viewer";
  joinedAt: Date;
}

export interface IBoardColumn {
  id: string;
  title: string;
  color: string;
  position: number;
  wipLimit?: number;
}

export interface IBoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface IBoard {
  title: string;
  description?: string;
  ownerId: Types.ObjectId;
  scope: "personal" | "conversation";
  conversationId?: Types.ObjectId;
  members: IBoardMember[];
  columns: IBoardColumn[];
  labels: IBoardLabel[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IBoardDocument extends IBoard, Document {
  _id: Types.ObjectId;
}

/* ─── Sub-schemas ─── */

const boardMemberSchema = new Schema<IBoardMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const boardColumnSchema = new Schema<IBoardColumn>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 },
    color: { type: String, required: true },
    position: { type: Number, required: true },
    wipLimit: { type: Number, min: 0 },
  },
  { _id: false },
);

const boardLabelSchema = new Schema<IBoardLabel>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, maxlength: 50 },
    color: { type: String, required: true },
  },
  { _id: false },
);

/* ─── Main schema ─── */

const boardSchema = new Schema<IBoardDocument>(
  {
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, enum: ["personal", "conversation"], required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", sparse: true },
    members: { type: [boardMemberSchema], default: [] },
    columns: { type: [boardColumnSchema], default: [] },
    labels: { type: [boardLabelSchema], default: [] },
  },
  { timestamps: true, collection: "boards" },
);

/* ─── Indexes ─── */

boardSchema.index({ ownerId: 1, scope: 1 });
boardSchema.index({ conversationId: 1 }, { unique: true, sparse: true });
boardSchema.index({ "members.userId": 1 });

const Board: Model<IBoardDocument> =
  mongoose.models.Board || mongoose.model<IBoardDocument>("Board", boardSchema);

export default Board;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/infra/db/models/__tests__/board.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/board.ts src/lib/infra/db/models/__tests__/board.test.ts
git commit -m "feat(board): add Board MongoDB model with indexes"
```

---

## Task 3: Task MongoDB Model

**Files:**
- Create: `src/lib/infra/db/models/task.ts`
- Test: `src/lib/infra/db/models/__tests__/task.test.ts`

**Step 1: Write the model test**

```typescript
// src/lib/infra/db/models/__tests__/task.test.ts
import { describe, it, expect } from "vitest";

describe("Task model schema", () => {
  it("has correct required fields", async () => {
    const { default: Task } = await import("../task");
    const schema = Task.schema;

    expect(schema.path("boardId")).toBeDefined();
    expect(schema.path("columnId")).toBeDefined();
    expect(schema.path("position")).toBeDefined();
    expect(schema.path("title")).toBeDefined();
    expect(schema.path("priority")).toBeDefined();
    expect(schema.path("creatorId")).toBeDefined();
    expect(schema.path("subtasks")).toBeDefined();
    expect(schema.path("linkedDocs")).toBeDefined();
  });

  it("priority enum has correct values", async () => {
    const { default: Task } = await import("../task");
    const priorityPath = Task.schema.path("priority") as any;
    expect(priorityPath.enumValues).toEqual(["urgent", "high", "medium", "low", "none"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/infra/db/models/__tests__/task.test.ts`
Expected: FAIL

**Step 3: Write the Task model**

```typescript
// src/lib/infra/db/models/task.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* ─── Interfaces ─── */

export interface ISubtask {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: Types.ObjectId;
}

export interface ILinkedDoc {
  googleDocId: string;
  title: string;
  url: string;
  type: "doc" | "sheet" | "slide" | "pdf" | "file";
}

export interface ILinkedEmail {
  gmailId: string;
  subject: string;
  from: string;
}

export interface ITaskSource {
  type: "manual" | "ai" | "meeting-mom" | "email" | "chat";
  sourceId?: string;
}

export interface ITask {
  boardId: Types.ObjectId;
  columnId: string;
  position: number;
  title: string;
  description?: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  creatorId: Types.ObjectId;
  assigneeId?: Types.ObjectId;
  collaborators: Types.ObjectId[];
  labels: string[];
  dueDate?: Date;
  startDate?: Date;
  subtasks: ISubtask[];
  linkedDocs: ILinkedDoc[];
  linkedEmails: ILinkedEmail[];
  meetingId?: Types.ObjectId;
  parentTaskId?: Types.ObjectId;
  source: ITaskSource;
  estimatePoints?: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaskDocument extends ITask, Document {
  _id: Types.ObjectId;
}

/* ─── Sub-schemas ─── */

const subtaskSchema = new Schema<ISubtask>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 500 },
    done: { type: Boolean, default: false },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const linkedDocSchema = new Schema<ILinkedDoc>(
  {
    googleDocId: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ["doc", "sheet", "slide", "pdf", "file"], required: true },
  },
  { _id: false },
);

const linkedEmailSchema = new Schema<ILinkedEmail>(
  {
    gmailId: { type: String, required: true },
    subject: { type: String, required: true },
    from: { type: String, required: true },
  },
  { _id: false },
);

const taskSourceSchema = new Schema<ITaskSource>(
  {
    type: { type: String, enum: ["manual", "ai", "meeting-mom", "email", "chat"], default: "manual" },
    sourceId: { type: String },
  },
  { _id: false },
);

/* ─── Main schema ─── */

const taskSchema = new Schema<ITaskDocument>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: "Board", required: true },
    columnId: { type: String, required: true },
    position: { type: Number, required: true, default: 0 },
    title: { type: String, required: true, maxlength: 500 },
    description: { type: String, maxlength: 10000 },
    priority: { type: String, enum: ["urgent", "high", "medium", "low", "none"], default: "none" },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    collaborators: [{ type: Schema.Types.ObjectId, ref: "User" }],
    labels: [{ type: String }],
    dueDate: { type: Date },
    startDate: { type: Date },
    subtasks: { type: [subtaskSchema], default: [] },
    linkedDocs: { type: [linkedDocSchema], default: [] },
    linkedEmails: { type: [linkedEmailSchema], default: [] },
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting" },
    parentTaskId: { type: Schema.Types.ObjectId, ref: "Task" },
    source: { type: taskSourceSchema, default: { type: "manual" } },
    estimatePoints: { type: Number, min: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: "tasks" },
);

/* ─── Indexes ─── */

taskSchema.index({ boardId: 1, columnId: 1, position: 1 });
taskSchema.index({ assigneeId: 1, dueDate: 1 });
taskSchema.index({ boardId: 1, updatedAt: -1 });
taskSchema.index({ meetingId: 1 }, { sparse: true });
taskSchema.index({ parentTaskId: 1 }, { sparse: true });
taskSchema.index({ title: "text", description: "text" });

const Task: Model<ITaskDocument> =
  mongoose.models.Task || mongoose.model<ITaskDocument>("Task", taskSchema);

export default Task;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/infra/db/models/__tests__/task.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/task.ts src/lib/infra/db/models/__tests__/task.test.ts
git commit -m "feat(board): add Task MongoDB model with indexes"
```

---

## Task 4: TaskComment MongoDB Model

**Files:**
- Create: `src/lib/infra/db/models/task-comment.ts`

**Step 1: Write the TaskComment model**

```typescript
// src/lib/infra/db/models/task-comment.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITaskComment {
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  type: "comment" | "activity";
  content: string;
  changes?: {
    field: string;
    from: string;
    to: string;
  };
  createdAt: Date;
}

export interface ITaskCommentDocument extends ITaskComment, Document {
  _id: Types.ObjectId;
}

const changesSchema = new Schema(
  {
    field: { type: String, required: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
  },
  { _id: false },
);

const taskCommentSchema = new Schema<ITaskCommentDocument>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["comment", "activity"], default: "comment" },
    content: { type: String, required: true, maxlength: 4000 },
    changes: { type: changesSchema },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "task_comments" },
);

taskCommentSchema.index({ taskId: 1, createdAt: -1 });

const TaskComment: Model<ITaskCommentDocument> =
  mongoose.models.TaskComment ||
  mongoose.model<ITaskCommentDocument>("TaskComment", taskCommentSchema);

export default TaskComment;
```

**Step 2: Commit**

```bash
git add src/lib/infra/db/models/task-comment.ts
git commit -m "feat(board): add TaskComment MongoDB model"
```

---

## Task 5: Board Helper — Default Board Creation

**Files:**
- Create: `src/lib/board/helpers.ts`

**Step 1: Write the board helpers**

This module provides `getOrCreatePersonalBoard(userId)` — auto-creates a personal board with default columns if the user doesn't have one.

```typescript
// src/lib/board/helpers.ts
import mongoose from "mongoose";
import Board, { IBoardDocument } from "@/lib/infra/db/models/board";
import { nanoid } from "nanoid";

const DEFAULT_COLUMNS = [
  { id: nanoid(8), title: "To Do", color: "#6B7280", position: 0 },
  { id: nanoid(8), title: "In Progress", color: "#3B82F6", position: 1 },
  { id: nanoid(8), title: "Review", color: "#F59E0B", position: 2 },
  { id: nanoid(8), title: "Done", color: "#10B981", position: 3 },
];

const DEFAULT_LABELS = [
  { id: nanoid(8), name: "Bug", color: "#EF4444" },
  { id: nanoid(8), name: "Feature", color: "#8B5CF6" },
  { id: nanoid(8), name: "Design", color: "#EC4899" },
  { id: nanoid(8), name: "Urgent", color: "#F97316" },
];

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
      columns: DEFAULT_COLUMNS,
      labels: DEFAULT_LABELS,
    });
  }

  return board;
}

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
```

**Step 2: Verify nanoid is available**

Run: `grep '"nanoid"' package.json`
If not found, install: `npm install nanoid`

**Step 3: Commit**

```bash
git add src/lib/board/helpers.ts
git commit -m "feat(board): add board helper with auto-creation"
```

---

## Task 6: Board API Routes — GET & POST /api/boards

**Files:**
- Create: `src/app/api/boards/route.ts`
- Test: `src/app/api/boards/__tests__/route.test.ts`

**Step 1: Write the test**

```typescript
// src/app/api/boards/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockBoardChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};

vi.mock("@/lib/infra/db/models/board", () => ({
  default: {
    find: vi.fn(() => mockBoardChain),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      _id: "board1",
      title: "My Tasks",
      scope: "personal",
      columns: [],
      labels: [],
      members: [],
    }),
  },
}));

function createRequest(method: string, body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/boards";
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const { GET, POST } = await import("../route");

describe("GET /api/boards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns boards for authenticated user", async () => {
    mockBoardChain.lean.mockResolvedValue([
      { _id: "b1", title: "My Tasks", scope: "personal" },
    ]);
    const res = await GET(createRequest("GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/boards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a board with valid input", async () => {
    const res = await POST(createRequest("POST", {
      title: "Sprint Board",
      scope: "personal",
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/boards/__tests__/route.test.ts`
Expected: FAIL

**Step 3: Write the route handler**

```typescript
// src/app/api/boards/route.ts
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, badRequest } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import { generateDefaultColumns, generateDefaultLabels } from "@/lib/board/helpers";

/* ─── Validation ─── */

const createBoardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scope: z.enum(["personal", "conversation"]),
  conversationId: z.string().optional(),
});

/* ─── GET /api/boards ─── */

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const boards = await Board.find({
    $or: [
      { ownerId: userOid },
      { "members.userId": userOid },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  return successResponse(boards);
});

/* ─── POST /api/boards ─── */

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const body = createBoardSchema.parse(await req.json());
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Personal boards: limit 1 per user
  if (body.scope === "personal") {
    const existing = await Board.findOne({ ownerId: userOid, scope: "personal" });
    if (existing) return badRequest("You already have a personal board");
  }

  // Conversation boards: require conversationId
  if (body.scope === "conversation" && !body.conversationId) {
    return badRequest("conversationId required for conversation boards");
  }

  const board = await Board.create({
    title: body.title,
    description: body.description,
    ownerId: userOid,
    scope: body.scope,
    conversationId: body.conversationId
      ? new mongoose.Types.ObjectId(body.conversationId)
      : undefined,
    members: [{ userId: userOid, role: "owner", joinedAt: new Date() }],
    columns: generateDefaultColumns(),
    labels: generateDefaultLabels(),
  });

  return successResponse(board, 201);
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/boards/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/boards/route.ts src/app/api/boards/__tests__/route.test.ts
git commit -m "feat(board): add GET/POST /api/boards routes"
```

---

## Task 7: Board Detail API — GET/PATCH/DELETE /api/boards/[boardId]

**Files:**
- Create: `src/app/api/boards/[boardId]/route.ts`

**Step 1: Write the route handler**

```typescript
// src/app/api/boards/[boardId]/route.ts
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

/* ─── Validation ─── */

const updateBoardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  columns: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(100),
        color: z.string(),
        position: z.number(),
        wipLimit: z.number().min(0).optional(),
      }),
    )
    .optional(),
  labels: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50),
        color: z.string(),
      }),
    )
    .optional(),
});

/* ─── Helper: find board + verify access ─── */

async function findBoardWithAccess(boardId: string, userId: string) {
  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");
  return board;
}

/* ─── GET /api/boards/[boardId] ─── */

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  return successResponse(board);
});

/* ─── PATCH /api/boards/[boardId] ─── */

export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  const body = updateBoardSchema.parse(await req.json());
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  const member = board.members.find(
    (m) => m.userId.toString() === userId,
  );
  if (!member || (member.role !== "owner" && member.role !== "editor")) {
    return badRequest("Insufficient permissions");
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.columns !== undefined) updates.columns = body.columns;
  if (body.labels !== undefined) updates.labels = body.labels;

  const updated = await Board.findByIdAndUpdate(boardId, { $set: updates }, { new: true }).lean();
  return successResponse(updated);
});

/* ─── DELETE /api/boards/[boardId] ─── */

export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  await connectDB();

  const board = await findBoardWithAccess(boardId, userId);
  if (board.ownerId.toString() !== userId) {
    return badRequest("Only the board owner can delete it");
  }

  await Board.findByIdAndDelete(boardId);
  return successResponse({ deleted: true });
});
```

**Step 2: Commit**

```bash
git add src/app/api/boards/[boardId]/route.ts
git commit -m "feat(board): add GET/PATCH/DELETE /api/boards/[boardId]"
```

---

## Task 8: Task API Routes — CRUD /api/boards/[boardId]/tasks

**Files:**
- Create: `src/app/api/boards/[boardId]/tasks/route.ts`
- Create: `src/app/api/boards/[boardId]/tasks/[taskId]/route.ts`
- Create: `src/app/api/boards/[boardId]/tasks/reorder/route.ts`

**Step 1: Write GET/POST tasks route**

```typescript
// src/app/api/boards/[boardId]/tasks/route.ts
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
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
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
```

**Step 2: Write task detail route (GET/PATCH/DELETE)**

```typescript
// src/app/api/boards/[boardId]/tasks/[taskId]/route.ts
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
```

**Step 3: Write reorder route**

```typescript
// src/app/api/boards/[boardId]/tasks/reorder/route.ts
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";

const reorderSchema = z.object({
  tasks: z.array(
    z.object({
      taskId: z.string(),
      columnId: z.string(),
      position: z.number(),
    }),
  ),
});

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId } = await context!.params;
  const body = reorderSchema.parse(await req.json());
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);
  const board = await Board.findOne({
    _id: new mongoose.Types.ObjectId(boardId),
    $or: [{ ownerId: userOid }, { "members.userId": userOid }],
  }).lean();
  if (!board) throw new NotFoundError("Board not found");

  // Batch update positions
  const bulkOps = body.tasks.map((t) => ({
    updateOne: {
      filter: {
        _id: new mongoose.Types.ObjectId(t.taskId),
        boardId: new mongoose.Types.ObjectId(boardId),
      },
      update: { $set: { columnId: t.columnId, position: t.position } },
    },
  }));

  await Task.bulkWrite(bulkOps);
  return successResponse({ reordered: body.tasks.length });
});
```

**Step 4: Commit**

```bash
git add src/app/api/boards/[boardId]/tasks/route.ts \
        src/app/api/boards/[boardId]/tasks/[taskId]/route.ts \
        src/app/api/boards/[boardId]/tasks/reorder/route.ts
git commit -m "feat(board): add task CRUD + reorder API routes"
```

---

## Task 9: Task Comments API

**Files:**
- Create: `src/app/api/boards/[boardId]/tasks/[taskId]/comments/route.ts`

**Step 1: Write comments route**

```typescript
// src/app/api/boards/[boardId]/tasks/[taskId]/comments/route.ts
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

const createCommentSchema = z.object({
  content: z.string().min(1).max(4000),
});

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

  const comments = await TaskComment.find({
    taskId: new mongoose.Types.ObjectId(taskId),
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return successResponse(comments);
});

export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { boardId, taskId } = await context!.params;
  const body = createCommentSchema.parse(await req.json());
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

  const comment = await TaskComment.create({
    taskId: new mongoose.Types.ObjectId(taskId),
    authorId: userOid,
    type: "comment",
    content: body.content,
  });

  return successResponse(comment, 201);
});
```

**Step 2: Commit**

```bash
git add src/app/api/boards/[boardId]/tasks/[taskId]/comments/route.ts
git commit -m "feat(board): add task comments API"
```

---

## Task 10: My Tasks API — GET /api/tasks/my

**Files:**
- Create: `src/app/api/tasks/my/route.ts`

**Step 1: Write the route**

This endpoint returns all tasks assigned to the current user across all boards (for the dashboard compact view).

```typescript
// src/app/api/tasks/my/route.ts
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Task from "@/lib/infra/db/models/task";

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  const tasks = await Task.find({
    $or: [{ assigneeId: userOid }, { creatorId: userOid }],
    completedAt: null,
  })
    .sort({ dueDate: 1, priority: 1, createdAt: -1 })
    .limit(50)
    .lean();

  return successResponse(tasks);
});
```

**Step 2: Commit**

```bash
git add src/app/api/tasks/my/route.ts
git commit -m "feat(board): add GET /api/tasks/my for dashboard"
```

---

## Task 11: KanbanBoard Frontend Component

**Files:**
- Create: `src/components/board/KanbanBoard.tsx`
- Create: `src/components/board/KanbanColumn.tsx`
- Create: `src/components/board/KanbanCard.tsx`
- Create: `src/hooks/useBoard.ts`

This is the largest task. See the design doc for UX requirements. The component renders as a fullscreen overlay (like the existing CalendarPanel expand) triggered from the dashboard Tasks card.

**Step 1: Write the useBoard hook**

```typescript
// src/hooks/useBoard.ts
"use client";

import { useState, useEffect, useCallback } from "react";

interface BoardColumn {
  id: string;
  title: string;
  color: string;
  position: number;
  wipLimit?: number;
}

interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

interface BoardTask {
  _id: string;
  boardId: string;
  columnId: string;
  position: number;
  title: string;
  description?: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  assigneeId?: string;
  labels: string[];
  dueDate?: string;
  subtasks: { id: string; title: string; done: boolean }[];
  completedAt?: string;
  createdAt: string;
}

interface Board {
  _id: string;
  title: string;
  columns: BoardColumn[];
  labels: BoardLabel[];
  members: { userId: string; role: string }[];
}

export function useBoard(boardId?: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setBoard(json.data);
      }
    } catch { setError("Failed to load board"); }
  }, [boardId]);

  const fetchTasks = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setTasks(json.data);
      }
    } catch { setError("Failed to load tasks"); }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBoard(), fetchTasks()]).finally(() => setLoading(false));
  }, [fetchBoard, fetchTasks]);

  const createTask = useCallback(async (data: { title: string; columnId: string; priority?: string }) => {
    if (!boardId) return;
    const res = await fetch(`/api/boards/${boardId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const json = await res.json();
      setTasks((prev) => [...prev, json.data]);
      return json.data;
    }
  }, [boardId]);

  const updateTask = useCallback(async (taskId: string, data: Partial<BoardTask>) => {
    if (!boardId) return;
    const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const json = await res.json();
      setTasks((prev) => prev.map((t) => (t._id === taskId ? json.data : t)));
      return json.data;
    }
  }, [boardId]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!boardId) return;
    await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setTasks((prev) => prev.filter((t) => t._id !== taskId));
  }, [boardId]);

  const reorderTasks = useCallback(async (updates: { taskId: string; columnId: string; position: number }[]) => {
    if (!boardId) return;
    await fetch(`/api/boards/${boardId}/tasks/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tasks: updates }),
    });
  }, [boardId]);

  return {
    board, tasks, loading, error,
    createTask, updateTask, deleteTask, reorderTasks,
    refetch: () => Promise.all([fetchBoard(), fetchTasks()]),
    setTasks,
  };
}
```

**Step 2: Build KanbanCard, KanbanColumn, and KanbanBoard components**

These are large React components. The implementation should follow these principles:
- **KanbanCard**: Compact card showing title, priority badge, assignee avatar, due date, subtask progress. Uses `useSortable` from dnd-kit.
- **KanbanColumn**: Column header with title + count + add button. Contains sorted cards. Uses `SortableContext` with `verticalListSortingStrategy`.
- **KanbanBoard**: Wraps everything in `DndContext`. Handles `onDragStart`, `onDragOver` (cross-column), `onDragEnd`. Renders `DragOverlay` for ghost card. Filter bar at top.

See `docs/plans/2026-03-17-task-board-design.md` Section 9 for full UX spec. Match Yoodle's existing design system: `border-2 border-[var(--border-strong)]`, `shadow-[4px_4px_0_var(--border-strong)]`, `font-family: var(--font-heading)`, yellow accent `#FFE600`, purple accent `#7C3AED`.

**Step 3: Commit**

```bash
git add src/hooks/useBoard.ts src/components/board/
git commit -m "feat(board): add KanbanBoard UI with dnd-kit drag-and-drop"
```

---

## Task 12: Task Detail Drawer Component

**Files:**
- Create: `src/components/board/TaskDetail.tsx`

Build a slide-over panel (right side, like MeetingDetail) that opens when clicking a kanban card. Contains:
- Editable title, priority dropdown, column/status dropdown
- Assignee selector (user search), due date picker, labels multi-select
- Markdown description (click to edit)
- Subtask checklist with progress bar
- Comments tab with activity tab
- "Schedule meeting" button (links to `/meetings/new` with task context)

Match existing drawer patterns from `src/components/dashboard/MeetingDetail.tsx` — uses Framer Motion `AnimatePresence`, fixed positioning, backdrop overlay.

**Step 1: Build the component following MeetingDetail patterns**

**Step 2: Commit**

```bash
git add src/components/board/TaskDetail.tsx
git commit -m "feat(board): add TaskDetail slide-over drawer"
```

---

## Task 13: Dashboard Integration — Replace TasksPanel

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`
- Create: `src/components/dashboard/TasksBoardPanel.tsx`

**Step 1: Create TasksBoardPanel**

A new component that replaces the current TasksPanel in the dashboard. Shows:
- Compact "My Tasks" list (assigned to me, sorted by due date)
- Header with count badge and "Open Board" expand button
- Clicking "Open Board" renders the full KanbanBoard as a fullscreen overlay

**Step 2: Update Dashboard.tsx**

Replace the `<TasksPanel>` usage with `<TasksBoardPanel>`. Keep the existing `pendingActions` props flowing through.

**Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/components/dashboard/TasksBoardPanel.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat(board): integrate kanban board into dashboard"
```

---

## Task 14: Build Verification & Cleanup

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run production build**

Run: `npx next build`
Expected: Build succeeds.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build/test issues from board implementation"
```

---

## Future Tasks (Phase 2-4, separate plans)

- **Phase 2**: Conversation boards, member management, group chat integration
- **Phase 3**: AI tools integration (10 new tools in tools.ts, workspace-context expansion, briefing enhancement)
- **Phase 4**: Google Drive doc attachment, email→task, meeting→task linking, smart suggestions

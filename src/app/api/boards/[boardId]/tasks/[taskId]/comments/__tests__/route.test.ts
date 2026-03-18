import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const VALID_BOARD_ID = "607f1f77bcf86cd799439022";
const VALID_TASK_ID = "707f1f77bcf86cd799439033";

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

const mockBoardFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/board", () => ({
  default: {
    findOne: (...args: unknown[]) => mockBoardFindOne(...args),
  },
}));

const mockTaskFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    findOne: (...args: unknown[]) => mockTaskFindOne(...args),
  },
}));

const mockCommentFindChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
const mockCommentCreate = vi.fn();
vi.mock("@/lib/infra/db/models/task-comment", () => ({
  default: {
    find: vi.fn(() => mockCommentFindChain),
    create: (...args: unknown[]) => mockCommentCreate(...args),
  },
}));

const boardDoc = {
  _id: VALID_BOARD_ID,
  ownerId: { toString: () => TEST_USER_ID },
  members: [],
};
const taskDoc = {
  _id: VALID_TASK_ID,
  boardId: VALID_BOARD_ID,
  title: "Task 1",
};

function createRequest(method: string, body?: unknown): NextRequest {
  const url = `http://localhost:3000/api/boards/${VALID_BOARD_ID}/tasks/${VALID_TASK_ID}/comments`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") headers.Origin = "http://localhost:3000";
  const init: RequestInit = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

function makeContext(boardId: string, taskId: string) {
  return { params: Promise.resolve({ boardId, taskId }) };
}

const { GET, POST } = await import("../route");

describe("GET /api/boards/[boardId]/tasks/[taskId]/comments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns comments for a task", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(taskDoc) });
    mockCommentFindChain.lean.mockResolvedValue([
      { _id: "c1", content: "Great work!", taskId: VALID_TASK_ID },
    ]);

    const res = await GET(createRequest("GET"), makeContext(VALID_BOARD_ID, VALID_TASK_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].content).toBe("Great work!");
  });

  it("returns 404 for invalid board ID", async () => {
    const res = await GET(createRequest("GET"), makeContext("bad-id", VALID_TASK_ID));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 404 for invalid task ID", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    const res = await GET(createRequest("GET"), makeContext(VALID_BOARD_ID, "bad-id"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("POST /api/boards/[boardId]/tasks/[taskId]/comments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a comment", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(taskDoc) });
    mockCommentCreate.mockResolvedValue({
      _id: "c2",
      taskId: VALID_TASK_ID,
      authorId: TEST_USER_ID,
      type: "comment",
      content: "Looks good!",
    });

    const res = await POST(
      createRequest("POST", { content: "Looks good!" }),
      makeContext(VALID_BOARD_ID, VALID_TASK_ID),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.content).toBe("Looks good!");
  });

  it("returns 404 for invalid IDs", async () => {
    const res = await POST(
      createRequest("POST", { content: "Hello" }),
      makeContext("bad-id", "bad-id"),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 400 for empty content", async () => {
    const res = await POST(
      createRequest("POST", { content: "" }),
      makeContext(VALID_BOARD_ID, VALID_TASK_ID),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

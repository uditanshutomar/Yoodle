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
const mockTaskFindByIdAndUpdate = vi.fn();
const mockTaskFindOneAndDelete = vi.fn();

vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    findOne: (...args: unknown[]) => mockTaskFindOne(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockTaskFindByIdAndUpdate(...args),
    findOneAndDelete: (...args: unknown[]) => mockTaskFindOneAndDelete(...args),
  },
}));

vi.mock("@/lib/infra/db/models/task-comment", () => ({
  default: {
    insertMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  },
}));

const boardDoc = {
  _id: VALID_BOARD_ID,
  ownerId: { toString: () => TEST_USER_ID },
  members: [],
  columns: [
    { id: "col-1", title: "To Do" },
    { id: "col-2", title: "Done" },
  ],
};

const taskDoc = {
  _id: VALID_TASK_ID,
  boardId: VALID_BOARD_ID,
  title: "Test Task",
  columnId: "col-1",
  priority: "none",
};

function createRequest(method: string, body?: unknown): NextRequest {
  const url = `http://localhost:3000/api/boards/${VALID_BOARD_ID}/tasks/${VALID_TASK_ID}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

function makeContext(boardId: string, taskId: string) {
  return { params: Promise.resolve({ boardId, taskId }) };
}

const { GET, PATCH, DELETE } = await import("../route");

describe("GET /api/boards/[boardId]/tasks/[taskId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a task", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(taskDoc) });

    const res = await GET(createRequest("GET"), makeContext(VALID_BOARD_ID, VALID_TASK_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("Test Task");
  });

  it("returns 400 for invalid IDs", async () => {
    const res = await GET(createRequest("GET"), makeContext("bad-id", "bad-id"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

describe("PATCH /api/boards/[boardId]/tasks/[taskId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a task", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(taskDoc) });
    const updatedTask = { ...taskDoc, title: "Updated Task" };
    mockTaskFindByIdAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updatedTask) });

    const res = await PATCH(
      createRequest("PATCH", { title: "Updated Task" }),
      makeContext(VALID_BOARD_ID, VALID_TASK_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("Updated Task");
  });

  it("returns 400 for invalid IDs", async () => {
    const res = await PATCH(
      createRequest("PATCH", { title: "Updated" }),
      makeContext("bad-id", "bad-id"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/boards/[boardId]/tasks/[taskId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes a task", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindOneAndDelete.mockResolvedValue(taskDoc);

    const res = await DELETE(
      createRequest("DELETE"),
      makeContext(VALID_BOARD_ID, VALID_TASK_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it("returns 400 for invalid IDs", async () => {
    const res = await DELETE(
      createRequest("DELETE"),
      makeContext("bad-id", "bad-id"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

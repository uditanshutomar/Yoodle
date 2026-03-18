import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const VALID_BOARD_ID = "607f1f77bcf86cd799439022";

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

const mockTaskFindChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
const mockTaskFindOneChain = {
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};
const mockTaskCreate = vi.fn();

vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    find: vi.fn(() => mockTaskFindChain),
    findOne: vi.fn(() => mockTaskFindOneChain),
    create: (...args: unknown[]) => mockTaskCreate(...args),
  },
}));

const boardDoc = {
  _id: VALID_BOARD_ID,
  ownerId: { toString: () => TEST_USER_ID },
  members: [],
  columns: [{ id: "col-1", title: "To Do" }],
};

function createRequest(method: string, url?: string, body?: unknown): NextRequest {
  const reqUrl = url || "http://localhost:3000/api/boards/" + VALID_BOARD_ID + "/tasks";
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(reqUrl, init);
}

function makeContext(boardId: string) {
  return { params: Promise.resolve({ boardId }) };
}

const { GET, POST } = await import("../route");

describe("GET /api/boards/[boardId]/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns tasks for a board", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindChain.lean.mockResolvedValue([
      { _id: "t1", title: "Task 1", boardId: VALID_BOARD_ID },
    ]);

    const res = await GET(createRequest("GET"), makeContext(VALID_BOARD_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("returns 404 for invalid board ID", async () => {
    const res = await GET(createRequest("GET"), makeContext("bad-id"));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("POST /api/boards/[boardId]/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a task", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFindOneChain.lean.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({
      _id: "task1",
      boardId: VALID_BOARD_ID,
      title: "New Task",
      columnId: "col-1",
      position: 1024,
    });

    const res = await POST(
      createRequest("POST", undefined, { title: "New Task", columnId: "col-1" }),
      makeContext(VALID_BOARD_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it("returns 404 for invalid board ID", async () => {
    const res = await POST(
      createRequest("POST", undefined, { title: "New Task", columnId: "col-1" }),
      makeContext("bad-id"),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("viewers cannot create tasks", async () => {
    const viewerBoard = {
      ...boardDoc,
      ownerId: { toString: () => "other-owner" },
      members: [{ userId: { toString: () => TEST_USER_ID }, role: "viewer" }],
    };
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(viewerBoard) });

    const res = await POST(
      createRequest("POST", undefined, { title: "New Task", columnId: "col-1" }),
      makeContext(VALID_BOARD_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Viewers");
  });
});

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

const mockTaskBulkWrite = vi.fn().mockResolvedValue({});
vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    bulkWrite: (...args: unknown[]) => mockTaskBulkWrite(...args),
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

function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/boards/${VALID_BOARD_ID}/tasks/reorder`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    },
  );
}

function makeContext(boardId: string) {
  return { params: Promise.resolve({ boardId }) };
}

const { POST } = await import("../route");

describe("POST /api/boards/[boardId]/tasks/reorder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reorders tasks successfully", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });

    const res = await POST(
      createRequest({
        tasks: [
          { taskId: VALID_TASK_ID, columnId: "col-1", position: 1024 },
        ],
      }),
      makeContext(VALID_BOARD_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.reordered).toBe(1);
    expect(mockTaskBulkWrite).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid board ID", async () => {
    const res = await POST(
      createRequest({ tasks: [] }),
      makeContext("bad-id"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("viewers cannot reorder", async () => {
    const viewerBoard = {
      ...boardDoc,
      ownerId: { toString: () => "other-owner" },
      members: [{ userId: { toString: () => TEST_USER_ID }, role: "viewer" }],
    };
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(viewerBoard) });

    const res = await POST(
      createRequest({
        tasks: [
          { taskId: VALID_TASK_ID, columnId: "col-1", position: 1024 },
        ],
      }),
      makeContext(VALID_BOARD_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Viewers");
  });
});

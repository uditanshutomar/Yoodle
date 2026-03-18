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
const mockBoardFindByIdAndUpdate = vi.fn();
const mockBoardFindByIdAndDelete = vi.fn();
vi.mock("@/lib/infra/db/models/board", () => ({
  default: {
    findOne: (...args: unknown[]) => mockBoardFindOne(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockBoardFindByIdAndUpdate(...args),
    findByIdAndDelete: (...args: unknown[]) => mockBoardFindByIdAndDelete(...args),
  },
}));

const mockTaskFind = vi.fn();
vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    find: (...args: unknown[]) => mockTaskFind(...args),
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/infra/db/models/task-comment", () => ({
  default: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
  },
}));

const boardDoc = {
  _id: VALID_BOARD_ID,
  title: "Sprint Board",
  ownerId: { toString: () => TEST_USER_ID },
  members: [],
  columns: [],
};

function createRequest(method: string, body?: unknown): NextRequest {
  const url = `http://localhost:3000/api/boards/${VALID_BOARD_ID}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (["POST", "PATCH", "DELETE"].includes(method)) headers.Origin = "http://localhost:3000";
  const init: RequestInit = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

function makeContext(boardId: string) {
  return { params: Promise.resolve({ boardId }) };
}

const { GET, PATCH, DELETE } = await import("../route");

describe("GET /api/boards/[boardId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns board details", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });

    const res = await GET(createRequest("GET"), makeContext(VALID_BOARD_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("Sprint Board");
  });

  it("returns 404 for invalid boardId", async () => {
    const res = await GET(createRequest("GET"), makeContext("bad-id"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 404 when board not found", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await GET(createRequest("GET"), makeContext(VALID_BOARD_ID));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("PATCH /api/boards/[boardId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates board title", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockBoardFindByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...boardDoc, title: "Updated" }),
    });

    const res = await PATCH(createRequest("PATCH", { title: "Updated" }), makeContext(VALID_BOARD_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 403 for insufficient permissions", async () => {
    const viewerBoard = {
      ...boardDoc,
      ownerId: { toString: () => "other-owner-id" },
      members: [{ userId: { toString: () => TEST_USER_ID }, role: "viewer" }],
    };
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(viewerBoard) });

    const res = await PATCH(createRequest("PATCH", { title: "Hacked" }), makeContext(VALID_BOARD_ID));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("returns 404 for invalid boardId", async () => {
    const res = await PATCH(createRequest("PATCH", { title: "X" }), makeContext("bad-id"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/boards/[boardId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes board and cascades", async () => {
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(boardDoc) });
    mockTaskFind.mockReturnValue({ distinct: vi.fn().mockResolvedValue([]) });
    mockBoardFindByIdAndDelete.mockResolvedValue(undefined);

    const res = await DELETE(createRequest("DELETE"), makeContext(VALID_BOARD_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it("returns 403 for non-owner", async () => {
    const memberBoard = {
      ...boardDoc,
      ownerId: { toString: () => "other-owner-id" },
      members: [{ userId: { toString: () => TEST_USER_ID }, role: "editor" }],
    };
    mockBoardFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(memberBoard) });

    const res = await DELETE(createRequest("DELETE"), makeContext(VALID_BOARD_ID));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

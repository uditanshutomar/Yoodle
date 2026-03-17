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

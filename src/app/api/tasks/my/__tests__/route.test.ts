import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

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

const mockAggregate = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

// ── Import route handler after all mocks ──────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(url = "http://localhost:3000/api/tasks/my") {
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/tasks/my", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns user's assigned tasks", async () => {
    const fakeTasks = [
      { _id: "t1", title: "Fix bug", priority: "high", assigneeId: TEST_USER_ID },
      { _id: "t2", title: "Write docs", priority: "low", assigneeId: TEST_USER_ID },
    ];
    mockAggregate.mockResolvedValue(fakeTasks);

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].title).toBe("Fix bug");
    expect(mockAggregate).toHaveBeenCalled();
  });

  it("returns empty array when no tasks assigned", async () => {
    mockAggregate.mockResolvedValue([]);

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });
});

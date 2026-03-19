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

// ── User model mock ──
const mockUserChain = {
  select: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
vi.mock("@/lib/infra/db/models/user", () => ({
  default: { find: vi.fn(() => mockUserChain) },
}));

// ── Meeting model mock ──
const mockMeetingChain = {
  select: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: { find: vi.fn(() => mockMeetingChain) },
}));

// ── Conversation model mock ──
const mockConvoChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: { find: vi.fn(() => mockConvoChain) },
}));

// ── DirectMessage model mock ──
const mockDmChain = {
  select: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: { find: vi.fn(() => mockDmChain) },
}));

// ── Board tasks mock ──
const mockedSearchBoardTasks = vi
  .fn()
  .mockResolvedValue({ success: true, summary: "", data: [] });
vi.mock("@/lib/board/tools", () => ({
  searchBoardTasks: (...args: unknown[]) => mockedSearchBoardTasks(...args),
}));

// ── Import route handler after all mocks ──────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(url: string) {
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockUserChain.lean.mockResolvedValue([]);
    mockMeetingChain.lean.mockResolvedValue([]);
    mockConvoChain.lean.mockResolvedValue([]);
    mockDmChain.lean.mockResolvedValue([]);
    mockedSearchBoardTasks.mockResolvedValue({
      success: true,
      summary: "",
      data: [],
    });
  });

  it("returns 400 for missing query", async () => {
    const res = await GET(
      createRequest("http://localhost:3000/api/search"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for query shorter than 2 characters", async () => {
    const res = await GET(
      createRequest("http://localhost:3000/api/search?q=a"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 200 with grouped results structure", async () => {
    mockUserChain.lean.mockResolvedValue([
      {
        _id: { toString: () => "u1" },
        name: "Alice Smith",
        displayName: "Alice",
        avatarUrl: "https://example.com/a.png",
        status: "online",
        mode: "social",
      },
    ]);

    mockMeetingChain.lean.mockResolvedValue([
      {
        _id: { toString: () => "m1" },
        title: "Standup",
        code: "abc-def",
        status: "scheduled",
        scheduledAt: new Date("2026-04-01"),
        type: "regular",
      },
    ]);

    mockedSearchBoardTasks.mockResolvedValue({
      success: true,
      summary: "Found 1 task",
      data: [{ id: "t1", title: "Fix bug", priority: "high", dueDate: null }],
    });

    const res = await GET(
      createRequest("http://localhost:3000/api/search?q=test"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("people");
    expect(body.data).toHaveProperty("meetings");
    expect(body.data).toHaveProperty("messages");
    expect(body.data).toHaveProperty("tasks");
    expect(Array.isArray(body.data.people)).toBe(true);
    expect(Array.isArray(body.data.meetings)).toBe(true);
    expect(Array.isArray(body.data.messages)).toBe(true);
    expect(Array.isArray(body.data.tasks)).toBe(true);
    expect(body.data.people).toHaveLength(1);
    expect(body.data.people[0].name).toBe("Alice Smith");
    expect(body.data.meetings).toHaveLength(1);
    expect(body.data.tasks).toHaveLength(1);
  });

  it("respects invisible mode for people", async () => {
    mockUserChain.lean.mockResolvedValue([
      {
        _id: { toString: () => "u2" },
        name: "Bob",
        displayName: "Bob",
        avatarUrl: null,
        status: "online",
        mode: "invisible",
      },
    ]);

    const res = await GET(
      createRequest("http://localhost:3000/api/search?q=Bob"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.people[0].status).toBe("offline");
  });

  it("returns partial results when one source fails", async () => {
    mockUserChain.lean.mockRejectedValue(new Error("DB error"));
    mockMeetingChain.lean.mockResolvedValue([
      {
        _id: { toString: () => "m1" },
        title: "Meeting",
        code: "xyz",
        status: "live",
        scheduledAt: null,
        type: "regular",
      },
    ]);

    const res = await GET(
      createRequest("http://localhost:3000/api/search?q=test"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.people).toHaveLength(0);
    expect(body.data.meetings).toHaveLength(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockUserFindById = vi.fn();
const mockUserCountDocuments = vi.fn().mockResolvedValue(100);
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    countDocuments: (...args: unknown[]) => mockUserCountDocuments(...args),
  },
}));

const mockMeetingCountDocuments = vi.fn().mockResolvedValue(50);
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    countDocuments: (...args: unknown[]) => mockMeetingCountDocuments(...args),
  },
}));

const mockAnalyticsCountDocuments = vi.fn().mockResolvedValue(200);
const mockAnalyticsAggregate = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/infra/db/models/analytics-event", () => ({
  default: {
    countDocuments: (...args: unknown[]) => mockAnalyticsCountDocuments(...args),
    aggregate: (...args: unknown[]) => mockAnalyticsAggregate(...args),
  },
}));

// ── Import route after all mocks ─────────────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(url = "http://localhost:3000/api/analytics/summary") {
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/analytics/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: TEST_USER_ID, role: "admin" }),
      }),
    });
    mockUserCountDocuments.mockResolvedValue(100);
    mockMeetingCountDocuments.mockResolvedValue(50);
    mockAnalyticsCountDocuments.mockResolvedValue(200);
    mockAnalyticsAggregate.mockResolvedValue([
      { _id: "page_view", count: 120 },
      { _id: "meeting_join", count: 80 },
    ]);
  });

  it("returns 200 with analytics summary for admin user", async () => {
    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.overview).toBeDefined();
    expect(body.data.overview.totalUsers).toBe(100);
    expect(body.data.trends).toBeDefined();
    expect(body.data.eventBreakdown).toHaveLength(2);
    expect(body.data.eventBreakdown[0]).toEqual({ type: "page_view", count: 120 });
  });

  it("returns correct overview fields", async () => {
    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(body.data.overview).toHaveProperty("totalUsers");
    expect(body.data.overview).toHaveProperty("totalMeetings");
    expect(body.data.overview).toHaveProperty("activeMeetings");
    expect(body.data.overview).toHaveProperty("recentEvents");
  });

  it("returns 403 when user is not an admin", async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: TEST_USER_ID, role: "member" }),
      }),
    });

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("returns 403 when user not found in DB", async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns empty event breakdown when no analytics events exist", async () => {
    mockAnalyticsAggregate.mockResolvedValue([]);

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.eventBreakdown).toEqual([]);
  });

  it("returns zero counts when database has no data", async () => {
    mockUserCountDocuments.mockResolvedValue(0);
    mockMeetingCountDocuments.mockResolvedValue(0);
    mockAnalyticsCountDocuments.mockResolvedValue(0);
    mockAnalyticsAggregate.mockResolvedValue([]);

    const res = await GET(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.overview.totalUsers).toBe(0);
    expect(body.data.overview.totalMeetings).toBe(0);
    expect(body.data.overview.activeMeetings).toBe(0);
    expect(body.data.overview.recentEvents).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

class MockAppError extends Error {
  statusCode: number;
  code: string;
  constructor(m: string, statusCode: number, code: string) {
    super(m);
    this.statusCode = statusCode;
    this.code = code;
  }
}
vi.mock("@/lib/infra/api/errors", () => ({
  AppError: MockAppError,
  BadRequestError: class BadRequestError extends MockAppError {
    constructor(m: string) {
      super(m, 400, "BAD_REQUEST");
      this.name = "BadRequestError";
    }
  },
  UnauthorizedError: class UnauthorizedError extends MockAppError {
    constructor(m: string) {
      super(m, 401, "UNAUTHORIZED");
      this.name = "UnauthorizedError";
    }
  },
  RateLimitError: class RateLimitError extends MockAppError {
    retryAfter: number;
    constructor(retryAfter: number) {
      super("Rate limit exceeded", 429, "RATE_LIMIT");
      this.name = "RateLimitError";
      this.retryAfter = retryAfter;
    }
  },
}));

// Mock MeetingAnalytics with chainable query
const mockAnalyticsFind = vi.fn();
vi.mock("@/lib/infra/db/models/meeting-analytics", () => ({
  default: {
    find: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: () => mockAnalyticsFind(),
    })),
  },
}));

// Mock analyzeMeetingPatterns
const mockAnalyzePatterns = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/ai/meeting-patterns", () => ({
  analyzeMeetingPatterns: (...args: unknown[]) => mockAnalyzePatterns(...args),
}));

// Import mocked modules to control behavior
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

// Import route handlers after all mocks
const { GET } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

function createRequest(
  url = "http://localhost:3000/api/meetings/analytics/trends",
) {
  return new NextRequest(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── Fake analytics entries ────────────────────────────────────────

const fakeEntries = [
  {
    _id: "a1",
    userId: TEST_USER_ID,
    meetingScore: 80,
    decisionCount: 3,
    actionItemCount: 5,
    duration: 30,
    createdAt: new Date(),
  },
  {
    _id: "a2",
    userId: TEST_USER_ID,
    meetingScore: 60,
    decisionCount: 1,
    actionItemCount: 2,
    duration: 45,
    createdAt: new Date(),
  },
];

describe("GET /api/meetings/analytics/trends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockedCheckRateLimit.mockResolvedValue(undefined);
    mockAnalyticsFind.mockResolvedValue([]);
    mockAnalyzePatterns.mockResolvedValue([]);
  });

  it("returns 200 with aggregate stats for valid range", async () => {
    mockAnalyticsFind.mockResolvedValue(fakeEntries);

    const req = createRequest(
      "http://localhost:3000/api/meetings/analytics/trends?range=month",
    );
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalMeetings).toBe(2);
    expect(body.data.avgScore).toBe(70); // (80+60)/2
    expect(body.data.totalDecisions).toBe(4); // 3+1
    expect(body.data.totalActionItems).toBe(7); // 5+2
    expect(body.data.avgDuration).toBe(38); // Math.round((30+45)/2)
    expect(body.data.range).toBe("month");
  });

  it("response includes patterns array", async () => {
    mockAnalyticsFind.mockResolvedValue([]);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty("patterns");
    expect(Array.isArray(body.data.patterns)).toBe(true);
  });

  it("patterns from analyzeMeetingPatterns are included in response", async () => {
    const fakePatterns = [
      { type: "recurring", message: "You have many recurring standups", severity: "info" },
      { type: "overrun", message: "Meetings often exceed scheduled time", severity: "warning" },
    ];
    mockAnalyzePatterns.mockResolvedValue(fakePatterns);
    mockAnalyticsFind.mockResolvedValue(fakeEntries);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(body.data.patterns).toEqual(fakePatterns);
  });

  it("returns 400 for invalid range value", async () => {
    const req = createRequest(
      "http://localhost:3000/api/meetings/analytics/trends?range=year",
    );
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns empty patterns when analyzer throws (non-critical)", async () => {
    mockAnalyzePatterns.mockRejectedValue(new Error("AI service down"));
    mockAnalyticsFind.mockResolvedValue(fakeEntries);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.patterns).toEqual([]);
  });

  it("accepts range=week", async () => {
    mockAnalyticsFind.mockResolvedValue([]);

    const req = createRequest(
      "http://localhost:3000/api/meetings/analytics/trends?range=week",
    );
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.range).toBe("week");
  });

  it("accepts range=quarter", async () => {
    mockAnalyticsFind.mockResolvedValue([]);

    const req = createRequest(
      "http://localhost:3000/api/meetings/analytics/trends?range=quarter",
    );
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.range).toBe("quarter");
  });

  it("calls checkRateLimit and getUserIdFromRequest", async () => {
    mockAnalyticsFind.mockResolvedValue([]);

    const req = createRequest();
    await GET(req, defaultContext);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "meetings",
    );
    expect(mockedGetUserId).toHaveBeenCalledWith(expect.any(NextRequest));
  });
});

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

// Mock Meeting model (dynamic import)
const mockMeetingFindOneChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};
const mockMeetingFindOne = vi.fn(() => mockMeetingFindOneChain);

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockMeetingFindOne(...args),
  },
}));

// Mock MeetingAnalytics model (dynamic import)
const mockAnalyticsFindOneChain = {
  lean: vi.fn().mockResolvedValue(null),
};
const mockAnalyticsFindOne = vi.fn(() => mockAnalyticsFindOneChain);

vi.mock("@/lib/infra/db/models/meeting-analytics", () => ({
  default: {
    findOne: (...args: unknown[]) => mockAnalyticsFindOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";

function createRequest() {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/analytics`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/meetings/[meetingId]/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns analytics for meeting", async () => {
    // Meeting exists and user is participant
    mockMeetingFindOneChain.lean.mockResolvedValueOnce({
      _id: TEST_MEETING_ID,
    });

    const fakeAnalytics = {
      meetingId: TEST_MEETING_ID,
      totalDuration: 3600,
      participantCount: 5,
      speakingTime: { [TEST_USER_ID]: 1200 },
    };
    mockAnalyticsFindOneChain.lean.mockResolvedValueOnce(fakeAnalytics);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalDuration).toBe(3600);
    expect(body.data.participantCount).toBe(5);
  });

  it("returns 404 for non-existent meeting analytics", async () => {
    // Meeting exists but no analytics
    mockMeetingFindOneChain.lean.mockResolvedValueOnce({
      _id: TEST_MEETING_ID,
    });
    mockAnalyticsFindOneChain.lean.mockResolvedValueOnce(null);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

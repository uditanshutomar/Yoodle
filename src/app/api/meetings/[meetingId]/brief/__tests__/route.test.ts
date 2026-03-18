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

// Mock MeetingBrief model (dynamic import)
const mockBriefFindOne = vi.fn().mockReturnValue({
  lean: vi.fn().mockResolvedValue(null),
});

vi.mock("@/lib/infra/db/models/meeting-brief", () => ({
  default: {
    findOne: (...args: unknown[]) => mockBriefFindOne(...args),
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
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/brief`,
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

describe("GET /api/meetings/[meetingId]/brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns pre-meeting brief", async () => {
    const fakeBrief = {
      meetingId: TEST_MEETING_ID,
      userId: TEST_USER_ID,
      summary: "Team standup brief",
      agenda: ["Status updates", "Blockers"],
    };
    mockBriefFindOne.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(fakeBrief),
    });

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.summary).toBe("Team standup brief");
  });

  it("returns 404 for non-existent meeting brief", async () => {
    mockBriefFindOne.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(null),
    });

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

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

const mockRedisSubscriber = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  unsubscribe: vi.fn(),
  quit: vi.fn(),
};

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => ({
    duplicate: vi.fn(() => mockRedisSubscriber),
  })),
}));

const mockFindOneChain = {
  lean: vi.fn().mockResolvedValue(null),
};
const mockFindOne = vi.fn(() => mockFindOneChain);

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439013";

function createRequest(
  url = `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/copilot`,
) {
  return new NextRequest(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

// ── Tests ──────────────────────────────────────────────────────────

describe("GET /api/meetings/[meetingId]/copilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns copilot SSE stream for meeting participant", async () => {
    const fakeMeeting = {
      _id: TEST_MEETING_ID,
      hostId: TEST_USER_ID,
      status: "live",
      participants: [{ userId: TEST_USER_ID, status: "joined" }],
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest();
    const response = await GET(req, defaultContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("returns 404 when meeting not found", async () => {
    mockFindOneChain.lean.mockResolvedValueOnce(null);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 when meeting is not live", async () => {
    const fakeMeeting = {
      _id: TEST_MEETING_ID,
      hostId: TEST_USER_ID,
      status: "scheduled",
      participants: [{ userId: TEST_USER_ID, status: "joined" }],
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest();
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

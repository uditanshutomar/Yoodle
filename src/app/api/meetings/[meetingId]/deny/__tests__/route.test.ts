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

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {},
}));

const mockWaitingSetDenied = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/redis/cache", () => ({
  waitingSetDenied: (...args: unknown[]) => mockWaitingSetDenied(...args),
}));

// Mock Meeting model with chainable query methods
const mockFindOneChain = {
  select: vi.fn().mockReturnThis(),
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

const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";
const TARGET_USER_ID = "507f1f77bcf86cd799439033";

function createRequest(body?: object) {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/deny`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

// ── Tests ─────────────────────────────────────────────────────────

describe("POST /api/meetings/[meetingId]/deny", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("denies a waiting participant", async () => {
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: TEST_USER_ID,
      status: "live",
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest({ userId: TARGET_USER_ID });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.denied).toBe(true);
    expect(mockWaitingSetDenied).toHaveBeenCalledWith(
      TEST_MEETING_ID,
      TARGET_USER_ID,
    );
  });

  it("returns 403 for non-host", async () => {
    const otherUserId = "507f1f77bcf86cd799439099";
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: otherUserId,
      status: "live",
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest({ userId: TARGET_USER_ID });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

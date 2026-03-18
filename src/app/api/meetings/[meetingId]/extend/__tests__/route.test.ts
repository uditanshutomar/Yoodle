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

vi.mock("@/lib/google/calendar", () => ({
  updateEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock Meeting model
const mockFindOneChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};

const mockFindOne = vi.fn(() => mockFindOneChain);
const mockUpdateOne = vi.fn().mockResolvedValue({});

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";

function createRequest(body?: object) {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/extend`,
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

describe("POST /api/meetings/[meetingId]/extend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("extends meeting duration", async () => {
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: { toString: () => TEST_USER_ID },
      status: "live",
      scheduledDuration: 30,
      calendarEventId: null,
      scheduledAt: new Date(),
      startedAt: new Date(),
      createdAt: new Date(),
    };
    // findOne returns a non-lean chain (no .lean() call in this route for the first query)
    mockFindOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue(fakeMeeting),
    });

    const req = createRequest({ additionalMinutes: 15 });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.meetingId).toBe(TEST_MEETING_ID);
    expect(body.data.scheduledDuration).toBe(45);
    expect(mockUpdateOne).toHaveBeenCalled();
  });

  it("returns 403 for non-host", async () => {
    const otherUserId = "507f1f77bcf86cd799439099";
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: { toString: () => otherUserId },
      status: "live",
      scheduledDuration: 30,
    };
    mockFindOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue(fakeMeeting),
    });

    const req = createRequest({ additionalMinutes: 15 });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

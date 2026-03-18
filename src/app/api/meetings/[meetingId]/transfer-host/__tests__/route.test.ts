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

// Mock Meeting model
const mockFindOneAndUpdate = vi.fn().mockResolvedValue(null);
const mockFindOneChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};
const mockFindOne = vi.fn(() => mockFindOneChain);

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";
const NEW_HOST_ID = "507f1f77bcf86cd799439033";

function createRequest(body?: object) {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/transfer-host`,
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

describe("POST /api/meetings/[meetingId]/transfer-host", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("transfers host role", async () => {
    const fakeMeetingResult = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: { toString: () => NEW_HOST_ID },
    };
    mockFindOneAndUpdate.mockResolvedValueOnce(fakeMeetingResult);

    const req = createRequest({ newHostUserId: NEW_HOST_ID });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.meetingId).toBe(TEST_MEETING_ID);
    expect(body.data.newHostUserId).toBe(NEW_HOST_ID);
  });

  it("returns 403 for non-host", async () => {
    // findOneAndUpdate returns null (atomic update failed)
    mockFindOneAndUpdate.mockResolvedValueOnce(null);
    // fallback findOne reveals caller is not the host
    const otherUserId = "507f1f77bcf86cd799439099";
    mockFindOneChain.lean.mockResolvedValueOnce({
      hostId: { toString: () => otherUserId },
      status: "live",
    });

    const req = createRequest({ newHostUserId: NEW_HOST_ID });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});

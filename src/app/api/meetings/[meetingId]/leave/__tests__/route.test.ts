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

vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(null) }),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    create: vi.fn().mockResolvedValue({ createdAt: new Date(), content: "Meeting ended.", senderId: "host" }),
  },
}));

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/google/calendar", () => ({
  updateEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock Meeting model
const mockFindOneAndUpdateResult = vi.fn().mockResolvedValue(null);
const mockFindOneAndUpdate = vi.fn(() => ({
  select: vi.fn().mockImplementation(() => mockFindOneAndUpdateResult()),
}));
const mockFindById = vi.fn().mockReturnValue({
  populate: vi.fn().mockReturnValue({
    populate: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    }),
  }),
});
const mockUpdateOne = vi.fn().mockResolvedValue({});

const mockFindOneChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};
const mockFindOne = vi.fn(() => mockFindOneChain);

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";

function createRequest() {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/leave`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
      },
    },
  );
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

// ── Tests ─────────────────────────────────────────────────────────

describe("POST /api/meetings/[meetingId]/leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("participant leaves meeting", async () => {
    const OTHER_HOST = "507f1f77bcf86cd799439099";
    const fakeMeetingResult = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: { toString: () => OTHER_HOST },
      participants: [
        { userId: { toString: () => TEST_USER_ID }, status: "left" },
        { userId: { toString: () => OTHER_HOST }, status: "joined", joinedAt: new Date() },
      ],
    };
    mockFindOneAndUpdateResult.mockResolvedValueOnce(fakeMeetingResult);

    const populatedMeeting = {
      _id: TEST_MEETING_ID,
      hostId: { _id: OTHER_HOST, name: "Host" },
      participants: [
        { userId: { _id: TEST_USER_ID, name: "User" }, status: "left" },
        { userId: { _id: OTHER_HOST, name: "Host" }, status: "joined" },
      ],
    };
    mockFindById.mockReturnValueOnce({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(populatedMeeting),
        }),
      }),
    });

    const req = createRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.meeting._id).toBe(TEST_MEETING_ID);
  });

  it("returns 404 when not in meeting", async () => {
    // findOneAndUpdate returns null (no match)
    mockFindOneAndUpdateResult.mockResolvedValueOnce(null);
    // fallback findOne also returns null (meeting not found)
    mockFindOneChain.lean.mockResolvedValueOnce(null);

    const req = createRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

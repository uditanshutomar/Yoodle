import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";

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

// Mock Meeting model with chainable query
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

const mockWaitingCheckStatus = vi.fn();
const mockWaitingGetQueue = vi.fn();
vi.mock("@/lib/infra/redis/cache", () => ({
  waitingCheckStatus: (...args: unknown[]) => mockWaitingCheckStatus(...args),
  waitingGetQueue: (...args: unknown[]) => mockWaitingGetQueue(...args),
}));

vi.mock("@/lib/meetings/helpers", () => ({
  buildMeetingFilter: vi.fn().mockReturnValue({ _id: TEST_MEETING_ID }),
}));

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost:3000/api/meetings/${TEST_MEETING_ID}/waiting-status`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers: { Origin: "http://localhost:3000" },
  });
}

const makeContext = () => ({
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
});

const { GET } = await import("../route");

describe("GET /api/meetings/[meetingId]/waiting-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns own admission status in check mode", async () => {
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: "someone-else",
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);
    mockWaitingCheckStatus.mockResolvedValue("admitted");

    const res = await GET(createRequest({ mode: "check" }), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("admitted");
    expect(mockWaitingCheckStatus).toHaveBeenCalledWith(TEST_MEETING_ID, TEST_USER_ID);
  });

  it("returns waiting queue for host", async () => {
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: { toString: () => TEST_USER_ID },
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);
    mockWaitingGetQueue.mockResolvedValue([
      { userId: "user-a", name: "Alice" },
      { userId: "user-b", name: "Bob" },
    ]);

    const res = await GET(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.users).toHaveLength(2);
    expect(mockWaitingGetQueue).toHaveBeenCalledWith(TEST_MEETING_ID);
  });

  it("returns 404 for non-existent meeting", async () => {
    mockFindOneChain.lean.mockResolvedValueOnce(null);

    const res = await GET(createRequest({ mode: "check" }), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 when non-host requests the queue (no mode param)", async () => {
    const fakeMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      hostId: { toString: () => "different-host-id" },
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const res = await GET(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_ROOM_ID = "ghost-room-abc";
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

vi.mock("@/lib/utils/id", () => ({
  generateMeetingCode: vi.fn().mockReturnValue("yoo-abc-def"),
}));

// Mock GhostRoom
const mockGhostRoomFindOne = vi.fn();
const mockGhostRoomFindOneAndUpdate = vi.fn();
vi.mock("@/lib/infra/db/models/ghost-room", () => ({
  default: {
    findOne: (...args: unknown[]) => mockGhostRoomFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockGhostRoomFindOneAndUpdate(...args),
  },
}));

// Mock Meeting
const mockMeetingCreate = vi.fn();
const mockMeetingFindById = vi.fn();
const mockMeetingDeleteOne = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    create: (...args: unknown[]) => mockMeetingCreate(...args),
    findById: (...args: unknown[]) => mockMeetingFindById(...args),
    deleteOne: (...args: unknown[]) => mockMeetingDeleteOne(...args),
  },
}));

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return actual;
});

function createRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/ghost-rooms/${TEST_ROOM_ID}/start-call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  });
}

const makeContext = () => ({
  params: Promise.resolve({ roomId: TEST_ROOM_ID }),
});

const { POST } = await import("../route");

describe("POST /api/ghost-rooms/[roomId]/start-call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("creates a new meeting for the ghost room", async () => {
    const ghostRoom = {
      roomId: TEST_ROOM_ID,
      title: "Ghost Chat",
      hostId: TEST_USER_ID,
      participants: [{ userId: TEST_USER_ID }],
      meetingId: null,
    };
    mockGhostRoomFindOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(ghostRoom) });

    const createdMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      code: "yoo-abc-def",
    };
    mockMeetingCreate.mockResolvedValue(createdMeeting);
    mockGhostRoomFindOneAndUpdate.mockResolvedValue({ meetingId: TEST_MEETING_ID });

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(res.status).toBe(200);
    expect(body.data.meetingId).toBe(TEST_MEETING_ID);
    expect(body.data.code).toBe("yoo-abc-def");
    expect(body.data.alreadyStarted).toBe(false);
    expect(mockMeetingCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for non-existent or expired ghost room", async () => {
    mockGhostRoomFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 for non-participant", async () => {
    const ghostRoom = {
      roomId: TEST_ROOM_ID,
      title: "Ghost Chat",
      hostId: { toString: () => "someone-else" },
      participants: [{ userId: { toString: () => "someone-else" } }],
      meetingId: null,
    };
    mockGhostRoomFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(ghostRoom) });

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns existing meeting if call already started", async () => {
    const ghostRoom = {
      roomId: TEST_ROOM_ID,
      title: "Ghost Chat",
      hostId: { toString: () => TEST_USER_ID },
      participants: [{ userId: { toString: () => TEST_USER_ID } }],
      meetingId: TEST_MEETING_ID,
    };
    mockGhostRoomFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(ghostRoom) });

    const existingMeeting = {
      _id: { toString: () => TEST_MEETING_ID },
      code: "yoo-abc-def",
      status: "live",
    };
    mockMeetingFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existingMeeting) }),
    });

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.alreadyStarted).toBe(true);
    expect(body.data.meetingId).toBe(TEST_MEETING_ID);
    expect(mockMeetingCreate).not.toHaveBeenCalled();
  });
});

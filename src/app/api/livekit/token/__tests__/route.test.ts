import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────

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

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// LiveKit SDK mocks
const mockToJwt = vi.fn().mockResolvedValue("mock-jwt-token");
const mockAddGrant = vi.fn();
const mockListRooms = vi.fn().mockResolvedValue([]);

vi.mock("livekit-server-sdk", () => {
  class MockAccessToken {
    addGrant = mockAddGrant;
    toJwt = mockToJwt;
  }
  class MockRoomServiceClient {
    listRooms = mockListRooms;
  }
  return {
    AccessToken: MockAccessToken,
    RoomServiceClient: MockRoomServiceClient,
  };
});

// LiveKit config mocks
vi.mock("@/lib/livekit/config", () => ({
  getLiveKitUrl: vi.fn().mockReturnValue("ws://localhost:7880"),
  getLiveKitApiKey: vi.fn().mockReturnValue("test-api-key"),
  getLiveKitApiSecret: vi.fn().mockReturnValue("test-api-secret"),
  isLiveKitConfigured: vi.fn().mockReturnValue(true),
}));

// Meeting model mock
const meetingFindById = vi.fn();
const meetingFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findById: (...args: unknown[]) => meetingFindById(...args),
    findOne: (...args: unknown[]) => meetingFindOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { isLiveKitConfigured } from "@/lib/livekit/config";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedIsLiveKitConfigured = vi.mocked(isLiveKitConfigured);

const { POST } = await import("../route");

// ── Test constants ───────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439013";

function createLeanQuery<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function createRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/livekit/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: JSON.stringify(body || {}),
  });
}

const defaultMeeting = {
  _id: TEST_MEETING_ID,
  hostId: { toString: () => TEST_USER_ID },
  status: "live",
  participants: [],
  settings: { maxParticipants: 50 },
};

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/livekit/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockedIsLiveKitConfigured.mockReturnValue(true);
    mockListRooms.mockResolvedValue([]);
    mockToJwt.mockResolvedValue("mock-jwt-token");
  });

  it("returns a token for a valid request with ObjectId roomId", async () => {
    meetingFindById.mockReturnValue(createLeanQuery(defaultMeeting));

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe("mock-jwt-token");
  });

  it("returns a token for a valid request with meeting code roomId", async () => {
    meetingFindOne.mockReturnValue(
      createLeanQuery({
        ...defaultMeeting,
        code: "yoo-abc-123",
      }),
    );

    const response = await POST(
      createRequest({ roomId: "yoo-abc-123", name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe("mock-jwt-token");
  });

  it("returns 400 when roomId is missing", async () => {
    const response = await POST(
      createRequest({ name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when name is missing", async () => {
    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 400 when LiveKit is not configured", async () => {
    mockedIsLiveKitConfigured.mockReturnValue(false);

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("LiveKit is not configured");
  });

  it("returns 404 when meeting is not found", async () => {
    meetingFindById.mockReturnValue(createLeanQuery(null));

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Meeting not found.");
  });

  it("returns 403 when meeting is not active", async () => {
    meetingFindById.mockReturnValue(
      createLeanQuery({ ...defaultMeeting, status: "ended" }),
    );

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Meeting is not active.");
  });

  it("returns 403 when user is not a participant", async () => {
    meetingFindById.mockReturnValue(
      createLeanQuery({
        ...defaultMeeting,
        hostId: { toString: () => "other-user-id" },
        participants: [
          { userId: { toString: () => "another-user" }, status: "joined" },
        ],
      }),
    );

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("You are not a participant in this meeting.");
  });

  it("returns 403 when meeting is full", async () => {
    meetingFindById.mockReturnValue(
      createLeanQuery({ ...defaultMeeting, settings: { maxParticipants: 2 } }),
    );
    mockListRooms.mockResolvedValue([{ numParticipants: 2 }]);

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Meeting is full");
  });

  it("still issues a token when LiveKit room service is unreachable (fail open)", async () => {
    meetingFindById.mockReturnValue(createLeanQuery(defaultMeeting));
    mockListRooms.mockRejectedValue(new Error("Network error"));

    const response = await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe("mock-jwt-token");
  });

  it("grants correct room permissions in the token", async () => {
    meetingFindById.mockReturnValue(createLeanQuery(defaultMeeting));

    await POST(
      createRequest({ roomId: TEST_MEETING_ID, name: "Test User" }),
      { params: Promise.resolve({}) },
    );

    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        roomJoin: true,
        room: TEST_MEETING_ID,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      }),
    );
  });
});

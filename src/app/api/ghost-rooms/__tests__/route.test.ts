import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

// ── Mock dependencies before importing the route ──────────────────

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

const mockGetRoomsForUser = vi.fn().mockResolvedValue([]);
const mockCreateRoom = vi.fn();

vi.mock("@/lib/ghost/ephemeral-store", () => ({
  ephemeralStore: {
    getRoomsForUser: (...args: unknown[]) => mockGetRoomsForUser(...args),
    createRoom: (...args: unknown[]) => mockCreateRoom(...args),
  },
}));

const mockUserFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

// ── Import route handlers after all mocks ─────────────────────────

const { GET, POST } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(method: string, url = "http://localhost:3000/api/ghost-rooms", body?: object) {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/ghost-rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns 200 with user's ghost rooms", async () => {
    const fakeRooms = [
      { roomId: "r1", title: "Room 1", code: "ghost-abc-def" },
      { roomId: "r2", title: "Room 2", code: "ghost-xyz-uvw" },
    ];
    mockGetRoomsForUser.mockResolvedValue(fakeRooms);

    const res = await GET(createRequest("GET"), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(fakeRooms);
    expect(mockGetRoomsForUser).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

describe("POST /api/ghost-rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ name: "Test User", displayName: "Tester" }),
      }),
    });
    mockCreateRoom.mockResolvedValue({
      roomId: "new-room",
      code: "ghost-abc-xyz",
      title: "My Room",
      hostId: TEST_USER_ID,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      participants: new Map([[TEST_USER_ID, { userId: TEST_USER_ID, name: "Test User" }]]),
    });
  });

  it("creates a ghost room and returns 201", async () => {
    const res = await POST(createRequest("POST", undefined, { title: "My Room" }), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.roomId).toBe("new-room");
    expect(body.data.code).toBe("ghost-abc-xyz");
    expect(mockCreateRoom).toHaveBeenCalledWith(TEST_USER_ID, "Tester", "My Room");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_ROOM_ID = "test-room-id-123";

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

const mockGetRoom = vi.fn();
const mockGetRoomByCode = vi.fn();
const mockAddMessage = vi.fn();
const mockUpdateNotes = vi.fn();
const mockAddParticipant = vi.fn();
const mockDestroyRoom = vi.fn();
const mockClaimAndDestroyRoom = vi.fn();
const mockRestoreRoom = vi.fn();

vi.mock("@/lib/ghost/ephemeral-store", () => ({
  ephemeralStore: {
    getRoom: (...args: unknown[]) => mockGetRoom(...args),
    getRoomByCode: (...args: unknown[]) => mockGetRoomByCode(...args),
    addMessage: (...args: unknown[]) => mockAddMessage(...args),
    updateNotes: (...args: unknown[]) => mockUpdateNotes(...args),
    addParticipant: (...args: unknown[]) => mockAddParticipant(...args),
    destroyRoom: (...args: unknown[]) => mockDestroyRoom(...args),
    claimAndDestroyRoom: (...args: unknown[]) => mockClaimAndDestroyRoom(...args),
    restoreRoom: (...args: unknown[]) => mockRestoreRoom(...args),
  },
}));

vi.mock("@/lib/ghost/consensus", () => ({
  checkConsensus: vi.fn().mockReturnValue({
    allVoted: false,
    totalVotes: 0,
    totalParticipants: 1,
    percentage: 0,
  }),
  persistGhostData: vi.fn().mockResolvedValue({ meetingId: "meeting-123" }),
}));

const mockUserFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

// ── Import route handlers after all mocks ─────────────────────────

const { GET, PATCH, DELETE } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(method: string, body?: object) {
  const url = `http://localhost:3000/api/ghost-rooms/${TEST_ROOM_ID}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

function makeRoom(overrides = {}) {
  const participants = new Map();
  participants.set(TEST_USER_ID, {
    userId: TEST_USER_ID,
    name: "Test User",
    displayName: "Tester",
    votedToSave: false,
  });
  return {
    roomId: TEST_ROOM_ID,
    code: "ghost-abc-def",
    title: "Test Room",
    hostId: TEST_USER_ID,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    participants,
    messages: [],
    notes: "",
    meetingId: null,
    ...overrides,
  };
}

const makeContext = (roomId = TEST_ROOM_ID) => ({
  params: Promise.resolve({ roomId }),
});

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/ghost-rooms/[roomId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns room details for a participant", async () => {
    mockGetRoom.mockResolvedValue(makeRoom());

    const res = await GET(createRequest("GET"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.roomId).toBe(TEST_ROOM_ID);
    expect(body.data.title).toBe("Test Room");
  });

  it("returns 404 for non-existent room", async () => {
    mockGetRoom.mockResolvedValue(null);

    const res = await GET(createRequest("GET"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/ghost-rooms/[roomId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockGetRoom.mockResolvedValue(makeRoom());
  });

  it("updates notes for a participant", async () => {
    mockUpdateNotes.mockResolvedValue(true);

    const res = await PATCH(
      createRequest("PATCH", { action: "updateNotes", notes: "Some notes" }),
      makeContext(),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);
    expect(mockUpdateNotes).toHaveBeenCalledWith(TEST_ROOM_ID, "Some notes");
  });

  it("returns 404 when patching non-existent room", async () => {
    mockGetRoom.mockResolvedValue(null);

    const res = await PATCH(
      createRequest("PATCH", { action: "updateNotes", notes: "test" }),
      makeContext(),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/ghost-rooms/[roomId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockDestroyRoom.mockResolvedValue(true);
    mockClaimAndDestroyRoom.mockResolvedValue(undefined);
  });

  it("removes a room when called by host", async () => {
    mockGetRoom.mockResolvedValue(makeRoom());

    const res = await DELETE(createRequest("DELETE"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.destroyed).toBe(true);
    expect(mockDestroyRoom).toHaveBeenCalledWith(TEST_ROOM_ID);
  });

  it("returns 404 for non-existent room", async () => {
    mockGetRoom.mockResolvedValue(null);

    const res = await DELETE(createRequest("DELETE"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 403 when non-host tries to delete", async () => {
    mockGetRoom.mockResolvedValue(makeRoom({ hostId: "other-user-id" }));

    const res = await DELETE(createRequest("DELETE"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

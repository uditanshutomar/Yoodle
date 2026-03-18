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
const mockVoteToSave = vi.fn();
const mockClaimAndDestroyRoom = vi.fn();

vi.mock("@/lib/ghost/ephemeral-store", () => ({
  ephemeralStore: {
    getRoom: (...args: unknown[]) => mockGetRoom(...args),
    voteToSave: (...args: unknown[]) => mockVoteToSave(...args),
    claimAndDestroyRoom: (...args: unknown[]) => mockClaimAndDestroyRoom(...args),
    restoreRoom: vi.fn(),
  },
}));

vi.mock("@/lib/ghost/consensus", () => ({
  checkConsensus: vi.fn().mockReturnValue({
    allVoted: false,
    totalVotes: 1,
    totalParticipants: 2,
    percentage: 50,
  }),
  persistGhostData: vi.fn().mockResolvedValue({ meetingId: "meeting-123" }),
}));

// ── Import route handler after all mocks ──────────────────────────

const { POST } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest() {
  return new NextRequest(`http://localhost:3000/api/ghost-rooms/${TEST_ROOM_ID}/vote-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  });
}

function makeRoom() {
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
    participants,
    messages: [],
    notes: "",
  };
}

const makeContext = () => ({
  params: Promise.resolve({ roomId: TEST_ROOM_ID }),
});

// ── Tests ─────────────────────────────────────────────────────────

describe("POST /api/ghost-rooms/[roomId]/vote-save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockClaimAndDestroyRoom.mockResolvedValue(undefined);
  });

  it("votes to save ghost room and returns vote status", async () => {
    mockGetRoom.mockResolvedValue(makeRoom());
    mockVoteToSave.mockResolvedValue({
      allVoted: false,
      totalVotes: 1,
      totalParticipants: 2,
    });

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.voted).toBe(true);
    expect(mockVoteToSave).toHaveBeenCalledWith(TEST_ROOM_ID, TEST_USER_ID);
  });

  it("returns 404 for non-existent room", async () => {
    mockGetRoom.mockResolvedValue(null);

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 403 for non-participant", async () => {
    const room = makeRoom();
    room.participants.clear();
    mockGetRoom.mockResolvedValue(room);

    const res = await POST(createRequest(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

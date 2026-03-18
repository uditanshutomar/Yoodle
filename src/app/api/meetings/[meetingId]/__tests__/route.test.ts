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

// Mock User model (imported for .populate side-effect)
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {},
}));

vi.mock("@/lib/google/calendar", () => ({
  deleteEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/features/flags", () => ({
  features: {
    maxParticipantsPerRoom: 25,
    edition: "community",
  },
}));

// Mock Meeting model with chainable query methods
const mockFindOneChain = {
  populate: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};

const mockFindOneAndUpdateChain = {
  populate: vi.fn().mockReturnThis(),
};

const mockFindOne = vi.fn(() => mockFindOneChain);
const mockFindOneAndUpdate = vi.fn(() => mockFindOneAndUpdateChain);

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET, PATCH } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439013";

function createRequest(
  method: string,
  url = `http://localhost:3000/api/meetings/${TEST_MEETING_ID}`,
  body?: object,
) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

// ── GET tests ──────────────────────────────────────────────────────

describe("GET /api/meetings/[meetingId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns meeting details for a host", async () => {
    const fakeMeeting = {
      _id: TEST_MEETING_ID,
      title: "Standup",
      code: "yoo-abc-def",
      status: "scheduled",
      hostId: { _id: TEST_USER_ID, name: "Host", email: "host@test.com" },
      participants: [],
      settings: {},
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("Standup");
    expect(body.data._id).toBe(TEST_MEETING_ID);
  });

  it("returns limited info for non-participants", async () => {
    const otherUserId = "507f1f77bcf86cd799439099";
    const fakeMeeting = {
      _id: TEST_MEETING_ID,
      title: "Private Meeting",
      code: "yoo-prv-xyz",
      status: "scheduled",
      type: "regular",
      hostId: { _id: otherUserId, name: "Other Host" },
      participants: [
        { userId: { _id: otherUserId }, status: "joined" },
      ],
      settings: { waitingRoom: true },
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Limited info should not include full participants details
    expect(body.data.participants[0]).toEqual({ status: "joined" });
    expect(body.data.settings).toEqual({ waitingRoom: true });
  });

  it("returns 404 when meeting not found", async () => {
    mockFindOneChain.lean.mockResolvedValueOnce(null);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid meeting ID (empty string)", async () => {
    const req = createRequest("GET");
    const context = { params: Promise.resolve({ meetingId: "" }) };
    const response = await GET(req, context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ── PATCH tests ────────────────────────────────────────────────────

describe("PATCH /api/meetings/[meetingId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("updates meeting title", async () => {
    const updatedMeeting = {
      _id: TEST_MEETING_ID,
      title: "Updated Title",
      status: "scheduled",
      hostId: { _id: TEST_USER_ID },
      participants: [],
    };
    // findOneAndUpdate returns the chain, then the chain resolves via populate
    // We need the chain to resolve to the updated meeting
    mockFindOneAndUpdateChain.populate.mockReturnValueOnce({
      populate: vi.fn().mockResolvedValue(updatedMeeting),
    });

    const req = createRequest("PATCH", undefined, { title: "Updated Title" });
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.meeting.title).toBe("Updated Title");
  });

  it("returns 400 when no valid fields to update", async () => {
    const req = createRequest("PATCH", undefined, {});
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for validation errors (title too long)", async () => {
    const req = createRequest("PATCH", undefined, {
      title: "A".repeat(201),
    });
    const response = await PATCH(req, defaultContext);

    expect(response.status).toBe(400);
  });
});

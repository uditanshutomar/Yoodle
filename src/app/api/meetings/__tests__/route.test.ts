import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock the Meeting model with chainable query methods
const mockMeetingChain = {
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};

const mockMeetingCreate = vi.fn();
vi.mock("@/lib/db/models/meeting", () => ({
  default: {
    find: vi.fn(() => mockMeetingChain),
    create: vi.fn((...args: unknown[]) => mockMeetingCreate(...args)),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("@/lib/auth/middleware", () => ({
  authenticateRequest: vi.fn(),
  getUserIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/utils/id", () => ({
  generateMeetingCode: vi.fn().mockReturnValue("yoo-abc-xyz"),
}));

vi.mock("@/lib/features/flags", () => ({
  features: {
    maxParticipantsPerRoom: 25,
    edition: "community",
  },
}));

// Import mocked modules to control behavior
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { checkRateLimit } from "@/lib/api/rate-limit";
import Meeting from "@/lib/db/models/meeting";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedMeetingFind = vi.mocked(Meeting.find);

// Import route handlers after all mocks
const { GET, POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011"; // Valid 24-char hex ObjectId

function createRequest(
  method: string,
  url = "http://localhost:3000/api/meetings",
  body?: object,
  headers?: Record<string, string>,
) {
  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

// The withHandler wrapper expects a context argument
const defaultContext = { params: Promise.resolve({}) };

describe("GET /api/meetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockedCheckRateLimit.mockResolvedValue(undefined);
    mockMeetingChain.lean.mockResolvedValue([]);
  });

  it("requires authentication — returns 401 when no token provided", async () => {
    const { UnauthorizedError } = await import("@/lib/api/errors");
    mockedGetUserId.mockRejectedValue(
      new UnauthorizedError("Missing authentication credentials."),
    );

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 200 with meeting list for authenticated user", async () => {
    const fakeMeetings = [
      { _id: "m1", title: "Standup", code: "yoo-abc-def", status: "scheduled" },
      { _id: "m2", title: "Retro", code: "yoo-xyz-uvw", status: "ended" },
    ];
    mockMeetingChain.lean.mockResolvedValue(fakeMeetings);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(fakeMeetings);
  });

  it("passes pagination params to the query chain", async () => {
    const req = createRequest(
      "GET",
      "http://localhost:3000/api/meetings?limit=5&offset=10",
    );
    await GET(req, defaultContext);

    expect(mockMeetingChain.limit).toHaveBeenCalledWith(5);
    expect(mockMeetingChain.skip).toHaveBeenCalledWith(10);
  });

  it("applies status filter when provided", async () => {
    const req = createRequest(
      "GET",
      "http://localhost:3000/api/meetings?status=live",
    );
    await GET(req, defaultContext);

    // The filter passed to Meeting.find should contain status: "live"
    const filterArg = mockedMeetingFind.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(filterArg.status).toBe("live");
  });

  it("applies type filter when provided", async () => {
    const req = createRequest(
      "GET",
      "http://localhost:3000/api/meetings?type=ghost",
    );
    await GET(req, defaultContext);

    const filterArg = mockedMeetingFind.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(filterArg.type).toBe("ghost");
  });

  it("calls checkRateLimit with 'meetings' group", async () => {
    const req = createRequest("GET");
    await GET(req, defaultContext);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "meetings");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const { RateLimitError } = await import("@/lib/api/errors");
    mockedCheckRateLimit.mockRejectedValue(new RateLimitError(30));

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.success).toBe(false);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("populates hostId with selected user fields", async () => {
    const req = createRequest("GET");
    await GET(req, defaultContext);

    expect(mockMeetingChain.populate).toHaveBeenCalledWith(
      "hostId",
      "name email displayName avatarUrl",
    );
  });

  it("sorts by scheduledAt descending then createdAt descending", async () => {
    const req = createRequest("GET");
    await GET(req, defaultContext);

    expect(mockMeetingChain.sort).toHaveBeenCalledWith({
      scheduledAt: -1,
      createdAt: -1,
    });
  });
});

describe("POST /api/meetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockedCheckRateLimit.mockResolvedValue(undefined);

    // Mock Meeting.create to return a document-like object with populate
    mockMeetingCreate.mockResolvedValue({
      _id: "new-meeting-id",
      code: "yoo-abc-xyz",
      title: "Test Meeting",
      type: "regular",
      status: "scheduled",
      hostId: TEST_USER_ID,
      participants: [],
      populate: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("requires authentication — returns 401 when no token provided", async () => {
    const { UnauthorizedError } = await import("@/lib/api/errors");
    mockedGetUserId.mockRejectedValue(
      new UnauthorizedError("Missing authentication credentials."),
    );

    const req = createRequest("POST", undefined, { title: "My Meeting" });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("creates a meeting with a title and returns 201", async () => {
    const req = createRequest("POST", undefined, { title: "Sprint Planning" });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(201);
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "yoo-abc-xyz",
        title: "Sprint Planning",
        type: "regular",
        status: "scheduled",
      }),
    );
  });

  it("creates a meeting with 'Untitled Meeting' title when title is omitted", async () => {
    const req = createRequest("POST", undefined, { type: "regular" });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(201);
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Untitled Meeting",
      }),
    );
  });

  it("creates a ghost type meeting when type is 'ghost'", async () => {
    const req = createRequest("POST", undefined, {
      title: "Ghost Chat",
      type: "ghost",
    });
    await POST(req, defaultContext);

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ghost",
      }),
    );
  });

  it("returns 400 for invalid type value", async () => {
    const req = createRequest("POST", undefined, {
      title: "Test",
      type: "invalid-type",
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when title exceeds 200 characters", async () => {
    const req = createRequest("POST", undefined, {
      title: "A".repeat(201),
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(400);
  });

  it("returns 400 when maxParticipants exceeds feature flag limit", async () => {
    const req = createRequest("POST", undefined, {
      title: "Big Meeting",
      settings: { maxParticipants: 50 }, // limit is 25 in community
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PARTICIPANT_LIMIT");
  });

  it("accepts valid settings within the feature flag limit", async () => {
    const req = createRequest("POST", undefined, {
      title: "Normal Meeting",
      settings: {
        maxParticipants: 10,
        allowRecording: true,
        waitingRoom: true,
      },
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(201);
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          maxParticipants: 10,
          allowRecording: true,
          waitingRoom: true,
        }),
      }),
    );
  });

  it("adds the host as first participant with role 'host'", async () => {
    const req = createRequest("POST", undefined, { title: "Team Sync" });
    await POST(req, defaultContext);

    const createArg = mockMeetingCreate.mock.calls[0][0];
    expect(createArg.participants).toHaveLength(1);
    expect(createArg.participants[0].role).toBe("host");
    expect(createArg.participants[0].status).toBe("joined");
  });

  it("calls checkRateLimit with 'meetings' group", async () => {
    const req = createRequest("POST", undefined, { title: "Test" });
    await POST(req, defaultContext);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "meetings");
  });

  it("blocks cross-origin POST requests (CSRF protection via withHandler)", async () => {
    const req = createRequest("POST", undefined, { title: "CSRF attempt" }, {
      Origin: "http://evil-site.com",
      Host: "localhost:3000",
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(403);
  });

  it("accepts scheduledAt as a valid ISO datetime", async () => {
    const scheduledAt = "2026-04-01T10:00:00.000Z";
    const req = createRequest("POST", undefined, {
      title: "Future Meeting",
      scheduledAt,
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(201);
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledAt: new Date(scheduledAt),
      }),
    );
  });

  it("rejects invalid scheduledAt format", async () => {
    const req = createRequest("POST", undefined, {
      title: "Bad Date",
      scheduledAt: "not-a-date",
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(400);
  });
});

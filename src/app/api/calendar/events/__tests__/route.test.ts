import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return { ...actual as object };
});

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockHasGoogleAccess = vi.fn();
vi.mock("@/lib/google/client", () => ({
  hasGoogleAccess: (...args: unknown[]) => mockHasGoogleAccess(...args),
}));

const mockListEvents = vi.fn();
const mockCreateEvent = vi.fn();
const mockUpdateEvent = vi.fn();
const mockDeleteEvent = vi.fn();
vi.mock("@/lib/google/calendar", () => ({
  listEvents: (...args: unknown[]) => mockListEvents(...args),
  createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
  deleteEvent: (...args: unknown[]) => mockDeleteEvent(...args),
}));

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
    }),
  },
}));

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/calendar/events");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/calendar/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(eventId?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/calendar/events");
  if (eventId) url.searchParams.set("eventId", eventId);
  return new NextRequest(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
  });
}

const sampleEvents = [
  {
    id: "event-1",
    summary: "Team Standup",
    start: { dateTime: "2025-01-06T09:00:00Z" },
    end: { dateTime: "2025-01-06T09:30:00Z" },
  },
  {
    id: "event-2",
    summary: "Sprint Planning",
    start: { dateTime: "2025-01-06T14:00:00Z" },
    end: { dateTime: "2025-01-06T15:00:00Z" },
  },
];

const { GET, POST, DELETE } = await import("../route");

describe("GET /api/calendar/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasGoogleAccess.mockResolvedValue(true);
    mockListEvents.mockResolvedValue(sampleEvents);
  });

  it("returns calendar events", async () => {
    const res = await GET(createGetRequest(), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(mockListEvents).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({ maxResults: 30 }),
    );
  });

  it("passes date range params to listEvents", async () => {
    const timeMin = "2025-01-01T00:00:00Z";
    const timeMax = "2025-01-31T23:59:59Z";

    const res = await GET(
      createGetRequest({ timeMin, timeMax, maxResults: "10" }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockListEvents).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({ timeMin, timeMax, maxResults: 10 }),
    );
  });

  it("uses default date range when params not provided", async () => {
    await GET(createGetRequest(), { params: Promise.resolve({}) });

    expect(mockListEvents).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        timeMin: expect.any(String),
        timeMax: expect.any(String),
        maxResults: 30,
      }),
    );
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 403 when Google Calendar is not connected", async () => {
    mockHasGoogleAccess.mockResolvedValue(false);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Google Calendar");
  });

  it("returns empty list when no events exist", async () => {
    mockListEvents.mockResolvedValue([]);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });
});

describe("POST /api/calendar/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasGoogleAccess.mockResolvedValue(true);
    mockCreateEvent.mockResolvedValue({
      id: "new-event-1",
      summary: "New Meeting",
    });
  });

  const validEvent = {
    title: "New Meeting",
    start: "2025-06-01T10:00:00Z",
    end: "2025-06-01T11:00:00Z",
  };

  it("creates a calendar event", async () => {
    const res = await POST(createPostRequest(validEvent), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-event-1");
    expect(mockCreateEvent).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({ title: "New Meeting" }),
    );
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(
      createPostRequest({ ...validEvent, title: "" }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when end is before start", async () => {
    const res = await POST(
      createPostRequest({
        ...validEvent,
        start: "2025-06-01T12:00:00Z",
        end: "2025-06-01T10:00:00Z",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 403 when Google is not connected", async () => {
    mockHasGoogleAccess.mockResolvedValue(false);

    const res = await POST(createPostRequest(validEvent), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/calendar/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasGoogleAccess.mockResolvedValue(true);
    mockDeleteEvent.mockResolvedValue(undefined);
  });

  it("deletes a calendar event", async () => {
    const res = await DELETE(createDeleteRequest("event-123"), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Event deleted.");
    expect(mockDeleteEvent).toHaveBeenCalledWith(TEST_USER_ID, "event-123");
  });

  it("returns 400 when eventId is missing", async () => {
    const res = await DELETE(createDeleteRequest(), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 403 when Google is not connected", async () => {
    mockHasGoogleAccess.mockResolvedValue(false);

    const res = await DELETE(createDeleteRequest("event-123"), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_CONV_ID = "507f1f77bcf86cd799439022";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

const mockSubscriber = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => ({
    duplicate: vi.fn(() => mockSubscriber),
  })),
}));

// ── Import route after all mocks ─────────────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(url = `http://localhost:3000/api/conversations/${TEST_CONV_ID}/stream`) {
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function createContext(id = TEST_CONV_ID) {
  return { params: Promise.resolve({ id }) };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/conversations/[id]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: TEST_CONV_ID }),
      }),
    });
    mockSubscriber.subscribe.mockResolvedValue(undefined);
  });

  it("returns SSE response with correct headers for valid auth + conversation", async () => {
    const res = await GET(createRequest(), createContext());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("returns a readable stream body", async () => {
    const res = await GET(createRequest(), createContext());

    expect(res.body).toBeDefined();
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  it("sets up Redis subscription on the correct channel", async () => {
    await GET(createRequest(), createContext());

    expect(mockSubscriber.subscribe).toHaveBeenCalledWith(`chat:${TEST_CONV_ID}`);
    expect(mockSubscriber.on).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("returns 401 when user is not authenticated", async () => {
    const authError = new Error("Unauthorized");
    authError.name = "UnauthorizedError";
    mockedGetUserId.mockRejectedValue(authError);

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid conversation ID", async () => {
    const res = await GET(createRequest(), createContext("not-a-valid-id"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid conversation ID");
  });

  it("returns 404 when user is not a participant of the conversation", async () => {
    mockFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 503 when Redis subscriber creation fails", async () => {
    mockSubscriber.subscribe.mockRejectedValue(new Error("Redis connection failed"));

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("Service temporarily unavailable");
  });

  it("returns 500 for unexpected errors", async () => {
    mockFindOne.mockImplementation(() => {
      throw new Error("DB exploded");
    });

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});

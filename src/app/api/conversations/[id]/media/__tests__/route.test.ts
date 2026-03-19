import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_CONV_ID = "507f1f77bcf86cd799439022";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

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

const mockConvFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: (...args: unknown[]) => mockConvFindOne(...args),
  },
}));

const mockDMFind = vi.fn();
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    find: (...args: unknown[]) => mockDMFind(...args),
  },
}));

// ── Import route after all mocks ─────────────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(
  method: string,
  type = "links",
  url?: string,
) {
  const finalUrl = url || `http://localhost:3000/api/conversations/${TEST_CONV_ID}/media?type=${type}`;
  return new NextRequest(finalUrl, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  });
}

function createContext(id = TEST_CONV_ID) {
  return { params: Promise.resolve({ id }) };
}

function setupConversationFound() {
  mockConvFindOne.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: TEST_CONV_ID }),
    }),
  });
}

function setupConversationNotFound() {
  mockConvFindOne.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    }),
  });
}

function setupMessages(messages: Array<{ _id: string; content: string; senderId: object; createdAt: Date }>) {
  mockDMFind.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(messages),
          }),
        }),
      }),
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/conversations/[id]/media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    setupConversationFound();
    setupMessages([]);
  });

  it("returns 200 with links extracted from messages", async () => {
    setupMessages([
      {
        _id: "msg1",
        content: "Check out https://example.com for details",
        senderId: { name: "Alice", displayName: "Alice A", avatarUrl: "/a.png" },
        createdAt: new Date("2025-01-01"),
      },
    ]);

    const res = await GET(createRequest("GET", "links"), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].url).toBe("https://example.com");
    expect(body.data.total).toBe(1);
  });

  it("returns 200 with images filtered by extension", async () => {
    setupMessages([
      {
        _id: "msg2",
        content: "Here is a pic https://example.com/photo.jpg and a link https://example.com",
        senderId: { name: "Bob", displayName: "Bob B" },
        createdAt: new Date("2025-01-02"),
      },
    ]);

    const res = await GET(createRequest("GET", "images"), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].url).toBe("https://example.com/photo.jpg");
  });

  it("returns empty array when no messages contain URLs", async () => {
    setupMessages([]);

    const res = await GET(createRequest("GET", "links"), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const res = await GET(createRequest("GET"), createContext());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 404 when conversation not found or user not a participant", async () => {
    setupConversationNotFound();

    const res = await GET(createRequest("GET"), createContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid conversation ID", async () => {
    const res = await GET(createRequest("GET", "links"), createContext("not-valid"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid media type", async () => {
    const res = await GET(createRequest("GET", "videos"), createContext());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("populates sender name from displayName with fallback to name", async () => {
    setupMessages([
      {
        _id: "msg3",
        content: "Link: https://example.com/page",
        senderId: { name: "Charlie", avatarUrl: "/c.png" },
        createdAt: new Date("2025-01-03"),
      },
    ]);

    const res = await GET(createRequest("GET", "links"), createContext());
    const body = await res.json();

    expect(body.data.items[0].sender.name).toBe("Charlie");
    expect(body.data.items[0].sender.avatarUrl).toBe("/c.png");
  });
});

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

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockAggregate = vi.fn();
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

function createRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/conversations/unread-count", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

const { GET } = await import("../route");

describe("GET /api/conversations/unread-count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns total unread count across conversations", async () => {
    mockAggregate.mockResolvedValue([{ _id: null, totalUnread: 8 }]);

    const res = await GET(createRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalUnread).toBe(8);
    expect(mockAggregate).toHaveBeenCalledOnce();
  });

  it("returns 0 when no conversations exist", async () => {
    mockAggregate.mockResolvedValue([]);

    const res = await GET(createRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.totalUnread).toBe(0);
  });
});

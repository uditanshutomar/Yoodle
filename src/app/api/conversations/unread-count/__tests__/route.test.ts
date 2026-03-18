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

const mockConvFindChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    find: vi.fn(() => mockConvFindChain),
  },
}));

const mockCountDocuments = vi.fn();
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
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
    mockConvFindChain.lean.mockResolvedValue([
      {
        _id: "conv1",
        participants: [
          { userId: { toString: () => TEST_USER_ID }, lastReadAt: new Date("2024-01-01") },
        ],
      },
      {
        _id: "conv2",
        participants: [
          { userId: { toString: () => TEST_USER_ID }, lastReadAt: new Date("2024-01-01") },
        ],
      },
    ]);
    mockCountDocuments.mockResolvedValueOnce(3).mockResolvedValueOnce(5);

    const res = await GET(createRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalUnread).toBe(8);
  });
});

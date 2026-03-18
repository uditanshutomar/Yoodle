import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const VALID_CONV_ID = "607f1f77bcf86cd799439022";

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

const mockFindByIdChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findById: vi.fn(() => mockFindByIdChain),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: () => ({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}));

function createRequest(method: string): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/conversations/" + VALID_CONV_ID + "/read",
    {
      method,
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    },
  );
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const { POST } = await import("../route");

describe("POST /api/conversations/[id]/read", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks conversation as read", async () => {
    mockFindByIdChain.lean.mockResolvedValue({
      _id: VALID_CONV_ID,
      participants: [
        { userId: { toString: () => TEST_USER_ID }, lastReadAt: new Date() },
      ],
    });

    const res = await POST(createRequest("POST"), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.success).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalled();
  });

  it("returns 400 for invalid ID", async () => {
    const res = await POST(createRequest("POST"), makeContext("invalid-id"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

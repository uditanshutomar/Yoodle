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

const mockConvFindByIdChain = {
  lean: vi.fn(),
};
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findById: vi.fn(() => mockConvFindByIdChain),
  },
}));

const mockUserFindByIdChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: vi.fn(() => mockUserFindByIdChain),
  },
}));

const mockPublish = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: () => ({
    publish: (...args: unknown[]) => mockPublish(...args),
  }),
}));

function createRequest(method: string): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/conversations/" + VALID_CONV_ID + "/typing",
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

describe("POST /api/conversations/[id]/typing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends typing indicator", async () => {
    mockConvFindByIdChain.lean.mockResolvedValue({
      _id: VALID_CONV_ID,
      participants: [
        { userId: { toString: () => TEST_USER_ID } },
      ],
    });
    mockUserFindByIdChain.lean.mockResolvedValue({
      _id: TEST_USER_ID,
      displayName: "Test User",
    });

    const res = await POST(createRequest("POST"), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(mockPublish).toHaveBeenCalledWith(
      `chat:${VALID_CONV_ID}`,
      expect.stringContaining('"type":"typing"'),
    );
  });
});

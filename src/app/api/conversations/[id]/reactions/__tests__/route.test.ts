import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const VALID_CONV_ID = "607f1f77bcf86cd799439022";
const VALID_MSG_ID = "707f1f77bcf86cd799439033";

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
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findById: vi.fn(() => mockConvFindByIdChain),
  },
}));

const mockDmFindByIdChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
const mockFindOneAndUpdate = vi.fn();
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    findById: vi.fn(() => mockDmFindByIdChain),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: () => ({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}));

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/conversations/" + VALID_CONV_ID + "/reactions",
    {
      method,
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const { POST } = await import("../route");

describe("POST /api/conversations/[id]/reactions", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupConversation() {
    mockConvFindByIdChain.lean.mockResolvedValue({
      _id: VALID_CONV_ID,
      participants: [
        { userId: { toString: () => TEST_USER_ID } },
      ],
    });
    mockDmFindByIdChain.lean.mockResolvedValue({
      _id: VALID_MSG_ID,
      conversationId: { toString: () => VALID_CONV_ID },
      reactions: [],
    });
  }

  it("adds a reaction", async () => {
    setupConversation();
    // First findOneAndUpdate (pull) returns null — reaction didn't exist
    const updatedMsg = {
      _id: VALID_MSG_ID,
      reactions: [{ emoji: "👍", userId: TEST_USER_ID }],
    };
    mockFindOneAndUpdate
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(updatedMsg) });

    const res = await POST(
      createRequest("POST", { messageId: VALID_MSG_ID, emoji: "👍" }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("removes a reaction (toggle)", async () => {
    setupConversation();
    // First findOneAndUpdate (pull) succeeds — reaction was removed
    const updatedMsg = {
      _id: VALID_MSG_ID,
      reactions: [],
    };
    mockFindOneAndUpdate.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue(updatedMsg),
    });

    const res = await POST(
      createRequest("POST", { messageId: VALID_MSG_ID, emoji: "👍" }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

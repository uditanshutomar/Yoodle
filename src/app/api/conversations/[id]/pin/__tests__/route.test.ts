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

const mockDmFindByIdChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    findById: vi.fn(() => mockDmFindByIdChain),
  },
}));

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/conversations/" + VALID_CONV_ID + "/pin",
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

describe("POST /api/conversations/[id]/pin", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupConversation(pinnedIds: string[] = []) {
    mockFindByIdChain.lean.mockResolvedValue({
      _id: VALID_CONV_ID,
      participants: [
        { userId: { toString: () => TEST_USER_ID } },
      ],
      pinnedMessageIds: pinnedIds.map((pid) => ({ toString: () => pid })),
    });
    mockDmFindByIdChain.lean.mockResolvedValue({
      _id: VALID_MSG_ID,
      conversationId: { toString: () => VALID_CONV_ID },
    });
  }

  it("pins a message", async () => {
    // First call: initial findById (no pinned messages)
    // Second call: updated findById after pin
    setupConversation([]);
    // Override the second findById call to return updated pinned list
    mockFindByIdChain.lean
      .mockResolvedValueOnce({
        _id: VALID_CONV_ID,
        participants: [{ userId: { toString: () => TEST_USER_ID } }],
        pinnedMessageIds: [],
      })
      .mockResolvedValueOnce({
        pinnedMessageIds: [{ toString: () => VALID_MSG_ID }],
      });

    const res = await POST(
      createRequest("POST", { messageId: VALID_MSG_ID }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pinnedMessageIds).toBeDefined();
  });

  it("unpins a message", async () => {
    // Message is already pinned
    mockFindByIdChain.lean
      .mockResolvedValueOnce({
        _id: VALID_CONV_ID,
        participants: [{ userId: { toString: () => TEST_USER_ID } }],
        pinnedMessageIds: [{ toString: () => VALID_MSG_ID }],
      })
      .mockResolvedValueOnce({
        pinnedMessageIds: [],
      });
    mockDmFindByIdChain.lean.mockResolvedValue({
      _id: VALID_MSG_ID,
      conversationId: { toString: () => VALID_CONV_ID },
    });

    const res = await POST(
      createRequest("POST", { messageId: VALID_MSG_ID }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pinnedMessageIds).toEqual([]);
    expect(mockUpdateOne).toHaveBeenCalled();
  });
});

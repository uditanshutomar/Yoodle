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

const mockDmFindChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    find: vi.fn(() => mockDmFindChain),
  },
}));

vi.mock("@/lib/chat/message-transform", () => ({
  toClientMessage: (msg: unknown) => msg,
}));

function createRequest(query?: string): NextRequest {
  const url = query
    ? `http://localhost:3000/api/conversations/${VALID_CONV_ID}/search?q=${encodeURIComponent(query)}`
    : `http://localhost:3000/api/conversations/${VALID_CONV_ID}/search`;
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const { GET } = await import("../route");

describe("GET /api/conversations/[id]/search", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupConversation() {
    mockConvFindByIdChain.lean.mockResolvedValue({
      _id: VALID_CONV_ID,
      participants: [
        { userId: { toString: () => TEST_USER_ID } },
      ],
    });
  }

  it("searches messages in conversation", async () => {
    setupConversation();
    const msgs = [
      { _id: "msg1", content: "hello world", senderId: TEST_USER_ID },
    ];
    mockDmFindChain.lean.mockResolvedValue(msgs);

    const res = await GET(createRequest("hello"), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("returns 400 for missing query", async () => {
    setupConversation();

    const res = await GET(createRequest(), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

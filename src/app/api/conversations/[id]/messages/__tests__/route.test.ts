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

const mockConversationFindOne = vi.fn();
const mockConversationFindOneAndUpdate = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: (...args: unknown[]) => mockConversationFindOne(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockConversationFindOneAndUpdate(...args),
  },
}));

const mockDMFindChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
const mockDMCreate = vi.fn();
const mockDMFindByIdChain = {
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};
const mockDMExists = vi.fn();

vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    find: vi.fn(() => mockDMFindChain),
    create: (...args: unknown[]) => mockDMCreate(...args),
    findById: vi.fn(() => mockDMFindByIdChain),
    exists: (...args: unknown[]) => mockDMExists(...args),
  },
}));

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: () => ({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/chat/message-transform", () => ({
  toClientMessage: (msg: unknown) => msg,
}));

vi.mock("@/lib/chat/agent-processor", () => ({
  processAgentResponses: vi.fn().mockResolvedValue(undefined),
}));

function createRequest(method: string, url?: string, body?: unknown): NextRequest {
  const reqUrl = url || "http://localhost:3000/api/conversations/" + VALID_CONV_ID + "/messages";
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(reqUrl, init);
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const convDoc = {
  _id: VALID_CONV_ID,
  participants: [{ userId: { toString: () => TEST_USER_ID } }],
  meetingId: null,
};

const { GET, POST } = await import("../route");

describe("GET /api/conversations/[id]/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns messages for a conversation", async () => {
    mockConversationFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(convDoc) }) });
    const msgs = [
      { _id: "m1", content: "Hello", senderId: TEST_USER_ID, createdAt: new Date() },
    ];
    mockDMFindChain.lean.mockResolvedValue(msgs);

    const res = await GET(createRequest("GET"), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.messages).toHaveLength(1);
  });

  it("returns 400 for invalid conversation ID", async () => {
    const res = await GET(createRequest("GET"), makeContext("bad-id"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

describe("POST /api/conversations/[id]/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new message", async () => {
    mockConversationFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(convDoc) }) });

    const createdMsg = {
      _id: "msg1",
      conversationId: VALID_CONV_ID,
      senderId: TEST_USER_ID,
      content: "Hey there",
      createdAt: new Date(),
    };
    mockDMCreate.mockResolvedValue(createdMsg);
    mockDMFindByIdChain.lean.mockResolvedValue(createdMsg);

    const res = await POST(
      createRequest("POST", undefined, { content: "Hey there" }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it("returns 400 for invalid conversation ID", async () => {
    const res = await POST(
      createRequest("POST", undefined, { content: "Hello" }),
      makeContext("bad-id"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

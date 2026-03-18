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
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: (...args: unknown[]) => mockConversationFindOne(...args),
  },
}));

const mockDirectMessageCountDocuments = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    countDocuments: (...args: unknown[]) => mockDirectMessageCountDocuments(...args),
  },
}));

const mockUserFindChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    find: vi.fn(() => mockUserFindChain),
  },
}));

function createRequest(method: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/conversations/" + VALID_CONV_ID, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const { GET } = await import("../route");

describe("GET /api/conversations/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns conversation for authenticated user", async () => {
    const convDoc = {
      _id: VALID_CONV_ID,
      type: "direct",
      name: null,
      participants: [
        { userId: { toString: () => TEST_USER_ID }, lastReadAt: new Date() },
      ],
      lastMessagePreview: "Hello",
      lastMessageSenderId: { toString: () => "other-user" },
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockConversationFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(convDoc) });
    mockUserFindChain.lean.mockResolvedValue([
      { _id: { toString: () => TEST_USER_ID }, name: "Test User", displayName: "Tester", avatarUrl: null },
    ]);

    const res = await GET(createRequest("GET"), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data._id).toBe(VALID_CONV_ID);
    expect(body.data.participants).toHaveLength(1);
  });

  it("returns 400 for invalid conversation ID", async () => {
    const res = await GET(createRequest("GET"), makeContext("invalid-id"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 404 when conversation not found", async () => {
    mockConversationFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await GET(createRequest("GET"), makeContext(VALID_CONV_ID));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

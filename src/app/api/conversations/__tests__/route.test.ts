import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

// Mock Conversation model
const mockConvFindChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
const mockConvFind = vi.fn(() => mockConvFindChain);
const mockConvFindOne = vi.fn();
const mockConvCreate = vi.fn();

vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    find: (...args: unknown[]) => mockConvFind(...args),
    findOne: (...args: unknown[]) => mockConvFindOne(...args),
    create: (...args: unknown[]) => mockConvCreate(...args),
  },
  buildDmPairKey: vi.fn((a: string, b: string) => [a, b].sort().join(":")),
}));

// Mock DirectMessage model
const mockDmCountDocuments = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    countDocuments: (...args: unknown[]) => mockDmCountDocuments(...args),
  },
}));

// Mock User model
const mockUserFindChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
const mockUserFind = vi.fn(() => mockUserFindChain);
const mockUserExists = vi.fn();
const mockUserCountDocuments = vi.fn();

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    find: (...args: unknown[]) => mockUserFind(...args),
    exists: (...args: unknown[]) => mockUserExists(...args),
    countDocuments: (...args: unknown[]) => mockUserCountDocuments(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET, POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const OTHER_USER_ID = "507f1f77bcf86cd799439022";

function createRequest(
  method: string,
  url = "http://localhost:3000/api/conversations",
  body?: object,
) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

const defaultContext = { params: Promise.resolve({}) };

// ── GET tests ──────────────────────────────────────────────────────

describe("GET /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockUserFindChain.lean.mockResolvedValue([]);
  });

  it("returns user's conversations", async () => {
    const fakeConversations = [
      {
        _id: { toString: () => "conv1" },
        type: "dm",
        name: null,
        participants: [
          { userId: { toString: () => TEST_USER_ID }, lastReadAt: new Date() },
          { userId: { toString: () => OTHER_USER_ID }, lastReadAt: new Date() },
        ],
        lastMessagePreview: "Hello",
        lastMessageSenderId: { toString: () => OTHER_USER_ID },
        lastMessageAt: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ];
    mockConvFindChain.lean.mockResolvedValueOnce(fakeConversations);
    mockUserFindChain.lean.mockResolvedValueOnce([
      { _id: { toString: () => TEST_USER_ID }, name: "Test User" },
      { _id: { toString: () => OTHER_USER_ID }, name: "Other User" },
    ]);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe("dm");
  });

  it("returns empty array when user has no conversations", async () => {
    mockConvFindChain.lean.mockResolvedValueOnce([]);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ── POST tests ─────────────────────────────────────────────────────

describe("POST /api/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("creates a DM conversation", async () => {
    // No existing DM
    mockConvFindOne.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    // Recipient exists
    mockUserExists.mockResolvedValueOnce({ _id: OTHER_USER_ID });

    const newConv = {
      _id: "new-conv-id",
      type: "dm",
      participants: [
        { userId: TEST_USER_ID, role: "admin" },
        { userId: OTHER_USER_ID, role: "member" },
      ],
    };
    mockConvCreate.mockResolvedValueOnce(newConv);

    const req = createRequest("POST", undefined, {
      type: "dm",
      recipientId: OTHER_USER_ID,
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("dm");
  });

  it("returns existing DM if one already exists", async () => {
    const existingConv = {
      _id: "existing-conv-id",
      type: "dm",
      participants: [
        { userId: TEST_USER_ID },
        { userId: OTHER_USER_ID },
      ],
    };
    mockConvFindOne.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(existingConv),
    });

    const req = createRequest("POST", undefined, {
      type: "dm",
      recipientId: OTHER_USER_ID,
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data._id).toBe("existing-conv-id");
  });

  it("returns 400 when creating DM with yourself", async () => {
    const req = createRequest("POST", undefined, {
      type: "dm",
      recipientId: TEST_USER_ID,
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid recipientId format", async () => {
    const req = createRequest("POST", undefined, {
      type: "dm",
      recipientId: "not-valid-id",
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(400);
  });

  it("creates a group conversation", async () => {
    // All participants exist
    mockUserCountDocuments.mockResolvedValueOnce(1);

    const newGroup = {
      _id: "new-group-id",
      type: "group",
      name: "Team Chat",
      participants: [
        { userId: TEST_USER_ID, role: "admin" },
        { userId: OTHER_USER_ID, role: "member" },
      ],
    };
    mockConvCreate.mockResolvedValueOnce(newGroup);

    const req = createRequest("POST", undefined, {
      type: "group",
      name: "Team Chat",
      participantIds: [OTHER_USER_ID],
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("group");
    expect(body.data.name).toBe("Team Chat");
  });
});

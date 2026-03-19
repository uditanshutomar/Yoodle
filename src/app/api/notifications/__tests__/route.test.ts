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

// Mock Notification model
const mockFindChain = {
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};
const mockFind = vi.fn(() => mockFindChain);
const mockCountDocuments = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/infra/db/models/notification", () => ({
  default: {
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

function createRequest(
  method: string,
  url = "http://localhost:3000/api/notifications",
) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
  };
  return new NextRequest(url, init);
}

const defaultContext = { params: Promise.resolve({}) };

// ── GET tests ──────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns paginated notifications with unread count", async () => {
    const fakeNotifications = [
      {
        _id: "notif1",
        userId: TEST_USER_ID,
        type: "mention",
        title: "You were mentioned",
        body: "Someone mentioned you in a message",
        sourceType: "message",
        sourceId: "msg-123",
        read: false,
        priority: "normal",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ];
    mockFindChain.lean.mockResolvedValueOnce(fakeNotifications);
    // total count
    mockCountDocuments.mockResolvedValueOnce(1);
    // unread count
    mockCountDocuments.mockResolvedValueOnce(1);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.unreadCount).toBe(1);
    expect(body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns empty array when no notifications", async () => {
    mockFindChain.lean.mockResolvedValueOnce([]);
    mockCountDocuments.mockResolvedValueOnce(0);
    mockCountDocuments.mockResolvedValueOnce(0);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toEqual([]);
    expect(body.data.unreadCount).toBe(0);
    expect(body.data.pagination.total).toBe(0);
  });
});

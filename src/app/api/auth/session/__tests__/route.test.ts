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

vi.mock("@/lib/infra/auth/jwt", () => ({
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock("@/lib/infra/redis/cache", () => ({
  tokenBlacklist: vi.fn().mockResolvedValue(undefined),
}));

const mockFindById = vi.fn();
const mockFindByIdAndUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

function createRequest(method = "GET"): NextRequest {
  const url = "http://localhost:3000/api/auth/session";
  const headers: Record<string, string> = {};
  if (method !== "GET") headers.Origin = "http://localhost:3000";
  return new NextRequest(url, { method, headers });
}

const { GET } = await import("../route");

describe("GET /api/auth/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns session for authenticated user", async () => {
    const userDoc = {
      _id: { toString: () => TEST_USER_ID },
      email: "user@example.com",
      name: "Test User",
      displayName: "Test",
      avatarUrl: null,
      mode: "normal",
      status: "online",
      location: null,
      preferences: {},
      googleId: "google-123",
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(userDoc),
      }),
    });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("user@example.com");
    expect(body.data.hasGoogleAccess).toBe(true);
  });

  it("returns 404 when user not found", async () => {
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });
});

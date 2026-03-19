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

const mockVerifyRefreshToken = vi.fn();
const mockSignAccessToken = vi.fn();
const mockSignRefreshToken = vi.fn();
vi.mock("@/lib/infra/auth/jwt", () => ({
  verifyRefreshToken: (...args: unknown[]) => mockVerifyRefreshToken(...args),
  signAccessToken: (...args: unknown[]) => mockSignAccessToken(...args),
  signRefreshToken: (...args: unknown[]) => mockSignRefreshToken(...args),
}));

const mockTokenBlacklist = vi.fn().mockResolvedValue(undefined);
const mockTokenIsBlacklisted = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/infra/redis/cache", () => ({
  tokenBlacklist: (...args: unknown[]) => mockTokenBlacklist(...args),
  tokenIsBlacklisted: (...args: unknown[]) => mockTokenIsBlacklisted(...args),
}));

const mockBcryptCompare = vi.fn();
const mockBcryptHash = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
    hash: (...args: unknown[]) => mockBcryptHash(...args),
  },
}));

const mockFindById = vi.fn();
const mockFindByIdAndUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

function createRequest(cookies: Record<string, string> = {}): NextRequest {
  const url = "http://localhost:3000/api/auth/refresh";
  const req = new NextRequest(url, {
    method: "POST",
    headers: { Origin: "http://localhost:3000" },
  });
  for (const [key, value] of Object.entries(cookies)) {
    req.cookies.set(key, value);
  }
  return req;
}

const { POST } = await import("../route");

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes tokens successfully", async () => {
    mockTokenIsBlacklisted.mockResolvedValue(false);
    mockVerifyRefreshToken.mockResolvedValue({ userId: TEST_USER_ID });
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        _id: TEST_USER_ID,
        refreshTokenHash: "hashed-token",
      }),
    });
    mockBcryptCompare.mockResolvedValue(true);
    mockSignAccessToken.mockResolvedValue("new-access-token");
    mockSignRefreshToken.mockResolvedValue("new-refresh-token");
    mockBcryptHash.mockResolvedValue("new-hashed-refresh-token");

    const res = await POST(createRequest({ "yoodle-refresh-token": "old-refresh-token" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Tokens refreshed successfully.");
    expect(mockTokenBlacklist).toHaveBeenCalledWith("old-refresh-token", 7 * 24 * 60 * 60);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({
      refreshTokenHash: "new-hashed-refresh-token",
    }));
  });

  it("returns 401 when no refresh token cookie is present", async () => {
    const res = await POST(createRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 401 when refresh token is blacklisted", async () => {
    mockTokenIsBlacklisted.mockResolvedValue(true);

    const res = await POST(createRequest({ "yoodle-refresh-token": "blacklisted-token" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 401 when JWT verification fails", async () => {
    mockTokenIsBlacklisted.mockResolvedValue(false);
    mockVerifyRefreshToken.mockRejectedValue(new Error("Token expired"));

    const res = await POST(createRequest({ "yoodle-refresh-token": "expired-token" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 401 and revokes sessions when bcrypt compare fails (token reuse)", async () => {
    mockTokenIsBlacklisted.mockResolvedValue(false);
    mockVerifyRefreshToken.mockResolvedValue({ userId: TEST_USER_ID });
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        _id: TEST_USER_ID,
        refreshTokenHash: "hashed-token",
      }),
    });
    mockBcryptCompare.mockResolvedValue(false);

    const res = await POST(createRequest({ "yoodle-refresh-token": "reused-token" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    // Should blacklist the suspicious token
    expect(mockTokenBlacklist).toHaveBeenCalledWith("reused-token", 7 * 24 * 60 * 60);
    // Should clear the stored refresh token hash
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(TEST_USER_ID, {
      $unset: { refreshTokenHash: 1 },
    });
  });
});

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

const mockVerifyAccessToken = vi.fn();
const mockVerifyRefreshToken = vi.fn();
vi.mock("@/lib/infra/auth/jwt", () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
  verifyRefreshToken: (...args: unknown[]) => mockVerifyRefreshToken(...args),
}));

const mockTokenBlacklist = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/redis/cache", () => ({
  tokenBlacklist: (...args: unknown[]) => mockTokenBlacklist(...args),
}));

const mockFindByIdAndUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

function createRequest(cookies: Record<string, string> = {}): NextRequest {
  const url = "http://localhost:3000/api/auth/logout";
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

describe("POST /api/auth/logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears session cookies and returns 200", async () => {
    mockVerifyAccessToken.mockResolvedValue({ userId: TEST_USER_ID });
    mockVerifyRefreshToken.mockResolvedValue({ userId: TEST_USER_ID });

    const res = await POST(createRequest({
      "yoodle-access-token": "access-tok",
      "yoodle-refresh-token": "refresh-tok",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Logged out successfully.");
    expect(mockTokenBlacklist).toHaveBeenCalledTimes(2);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({
      $unset: { refreshTokenHash: 1 },
      $set: { status: "offline" },
    }));
  });

  it("handles already-logged-out user (no cookies)", async () => {
    const res = await POST(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Logged out successfully.");
    expect(mockTokenBlacklist).not.toHaveBeenCalled();
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});

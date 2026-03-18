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

const mockVerifyMagicLink = vi.fn();
vi.mock("@/lib/infra/auth/magic-link", () => ({
  verifyMagicLink: (...args: unknown[]) => mockVerifyMagicLink(...args),
}));

vi.mock("@/lib/infra/auth/jwt", () => ({
  signAccessToken: vi.fn().mockResolvedValue("access-token-123"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token-123"),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-refresh-token") },
}));

const mockFindByIdAndUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

function createRequest(token?: string, email?: string): NextRequest {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (email) params.set("email", email);
  const url = `http://localhost:3000/api/auth/verify?${params.toString()}`;
  return new NextRequest(url, { method: "GET" });
}

const { GET } = await import("../route");

describe("GET /api/auth/verify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies valid token and redirects to dashboard", async () => {
    mockVerifyMagicLink.mockResolvedValue({
      _id: { toString: () => TEST_USER_ID },
      mode: "normal",
    });

    const res = await GET(createRequest("valid-token", "user@example.com"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/dashboard");
    expect(mockVerifyMagicLink).toHaveBeenCalledWith("valid-token", "user@example.com");
    expect(mockFindByIdAndUpdate).toHaveBeenCalled();
  });

  it("redirects with error for missing token", async () => {
    const res = await GET(createRequest(undefined, "user@example.com"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=invalid_link");
  });

  it("redirects with error for missing email", async () => {
    const res = await GET(createRequest("some-token", undefined));

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=invalid_link");
  });

  it("redirects with expired error when magic link has expired", async () => {
    mockVerifyMagicLink.mockRejectedValue(new Error("Token has expired"));

    const res = await GET(createRequest("expired-token", "user@example.com"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=link_expired");
  });
});

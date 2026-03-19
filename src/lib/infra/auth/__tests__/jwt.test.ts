import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Set JWT_SECRET and JWT_REFRESH_SECRET before importing the module
const MOCK_SECRET = "test-jwt-secret-at-least-32-chars-long";
const MOCK_REFRESH_SECRET = "test-jwt-refresh-secret-at-least-32-chars";

describe("JWT utilities", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", MOCK_SECRET);
    vi.stubEnv("JWT_REFRESH_SECRET", MOCK_REFRESH_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs and verifies an access token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../jwt");
    const token = await signAccessToken("user-123");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

    const payload = await verifyAccessToken(token);
    expect(payload.userId).toBe("user-123");
  });

  it("signs and verifies a refresh token", async () => {
    const { signRefreshToken, verifyRefreshToken } = await import("../jwt");
    const token = await signRefreshToken("user-456");
    const payload = await verifyRefreshToken(token);
    expect(payload.userId).toBe("user-456");
  });

  it("rejects an access token when verified as refresh", async () => {
    const { signAccessToken, verifyRefreshToken } = await import("../jwt");
    const token = await signAccessToken("user-123");
    // Different secrets means signature verification fails before type check
    await expect(verifyRefreshToken(token)).rejects.toThrow();
  });

  it("rejects a refresh token when verified as access", async () => {
    const { signRefreshToken, verifyAccessToken } = await import("../jwt");
    const token = await signRefreshToken("user-123");
    // Different secrets means signature verification fails before type check
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../jwt");
    const token = await signAccessToken("user-123");
    const tampered = token.slice(0, -5) + "xxxxx";
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("rejects a completely invalid token string", async () => {
    const { verifyAccessToken } = await import("../jwt");
    await expect(verifyAccessToken("not.a.jwt")).rejects.toThrow();
    await expect(verifyAccessToken("")).rejects.toThrow();
  });

  it("throws when JWT_SECRET is not set", async () => {
    vi.stubEnv("JWT_SECRET", "");
    // Re-import to get fresh module would be complex, so we test the behavior
    // by directly testing that the error path exists
    const { signAccessToken } = await import("../jwt");
    // The function reads JWT_SECRET at call time
    vi.stubEnv("JWT_SECRET", "");
    delete process.env.JWT_SECRET;
    await expect(signAccessToken("user-123")).rejects.toThrow("JWT_SECRET");
  });

  it("throws when JWT_REFRESH_SECRET is not set", async () => {
    const { signRefreshToken } = await import("../jwt");
    delete process.env.JWT_REFRESH_SECRET;
    await expect(signRefreshToken("user-123")).rejects.toThrow("JWT_REFRESH_SECRET");
  });
});

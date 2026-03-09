import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticateRequest } from "../middleware";
import { UnauthorizedError } from "@/lib/api/errors";

// Mock the JWT verification module
vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock the Redis cache module
vi.mock("@/lib/redis/cache", () => ({
  tokenIsBlacklisted: vi.fn(),
}));

// Import the mocked modules to control their behavior in tests
import { verifyAccessToken } from "@/lib/auth/jwt";
import { tokenIsBlacklisted } from "@/lib/redis/cache";

const mockedVerifyAccessToken = vi.mocked(verifyAccessToken);
const mockedTokenIsBlacklisted = vi.mocked(tokenIsBlacklisted);

function createRequest(options: {
  authHeader?: string;
  cookie?: string;
} = {}): Request {
  const headers = new Headers();
  if (options.authHeader) {
    headers.set("Authorization", options.authHeader);
  }
  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }

  return new Request("http://localhost:3000/api/test", {
    headers,
  });
}

describe("authenticateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedTokenIsBlacklisted.mockResolvedValue(false);
    mockedVerifyAccessToken.mockResolvedValue({ userId: "user-123" });
  });

  describe("token extraction", () => {
    it("extracts token from Authorization Bearer header", async () => {
      const req = createRequest({
        authHeader: "Bearer valid-token-123",
      });

      const result = await authenticateRequest(req);

      expect(result.userId).toBe("user-123");
      expect(mockedVerifyAccessToken).toHaveBeenCalledWith("valid-token-123");
    });

    it("extracts token from Cookie header (yoodle-access-token)", async () => {
      const req = createRequest({
        cookie: "yoodle-access-token=cookie-token-456; other=value",
      });

      const result = await authenticateRequest(req);

      expect(result.userId).toBe("user-123");
      expect(mockedVerifyAccessToken).toHaveBeenCalledWith("cookie-token-456");
    });

    it("prefers Authorization header over Cookie", async () => {
      const req = createRequest({
        authHeader: "Bearer header-token",
        cookie: "yoodle-access-token=cookie-token",
      });

      await authenticateRequest(req);

      expect(mockedVerifyAccessToken).toHaveBeenCalledWith("header-token");
    });

    it("handles URL-encoded cookie values", async () => {
      const req = createRequest({
        cookie: "yoodle-access-token=token%20with%20spaces",
      });

      await authenticateRequest(req);

      expect(mockedVerifyAccessToken).toHaveBeenCalledWith("token with spaces");
    });
  });

  describe("missing token", () => {
    it("throws UnauthorizedError when no token is provided", async () => {
      const req = createRequest();

      await expect(authenticateRequest(req)).rejects.toThrow(
        UnauthorizedError,
      );
      await expect(authenticateRequest(req)).rejects.toThrow(
        "Missing authentication credentials.",
      );
    });

    it("throws UnauthorizedError when Authorization header has no Bearer prefix", async () => {
      const req = createRequest({
        authHeader: "Basic abc123",
      });

      await expect(authenticateRequest(req)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("throws UnauthorizedError when Bearer token is empty", async () => {
      const req = createRequest({
        authHeader: "Bearer ",
      });

      await expect(authenticateRequest(req)).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe("blacklisted token", () => {
    it("throws UnauthorizedError when token is blacklisted", async () => {
      mockedTokenIsBlacklisted.mockResolvedValue(true);

      const req = createRequest({
        authHeader: "Bearer blacklisted-token",
      });

      await expect(authenticateRequest(req)).rejects.toThrow(
        UnauthorizedError,
      );
      await expect(
        authenticateRequest(
          createRequest({ authHeader: "Bearer blacklisted-token" }),
        ),
      ).rejects.toThrow("Token has been revoked.");
    });

    it("checks blacklist before verifying token", async () => {
      mockedTokenIsBlacklisted.mockResolvedValue(true);

      const req = createRequest({
        authHeader: "Bearer some-token",
      });

      await expect(authenticateRequest(req)).rejects.toThrow(
        UnauthorizedError,
      );

      // verifyAccessToken should NOT be called because the token was blacklisted
      expect(mockedVerifyAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("token verification", () => {
    it("returns userId from verified token payload", async () => {
      mockedVerifyAccessToken.mockResolvedValue({ userId: "user-abc" });

      const req = createRequest({
        authHeader: "Bearer good-token",
      });

      const result = await authenticateRequest(req);
      expect(result).toEqual({ userId: "user-abc" });
    });

    it("throws UnauthorizedError when token verification fails", async () => {
      mockedVerifyAccessToken.mockRejectedValue(
        new Error("Token expired"),
      );

      const req = createRequest({
        authHeader: "Bearer expired-token",
      });

      await expect(authenticateRequest(req)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("re-throws UnauthorizedError from verifyAccessToken", async () => {
      mockedVerifyAccessToken.mockRejectedValue(
        new UnauthorizedError("Invalid token type"),
      );

      const req = createRequest({
        authHeader: "Bearer wrong-type-token",
      });

      await expect(authenticateRequest(req)).rejects.toThrow(
        "Invalid token type",
      );
    });

    it("wraps generic errors in UnauthorizedError", async () => {
      mockedVerifyAccessToken.mockRejectedValue(
        new Error("JWT malformed"),
      );

      const req = createRequest({
        authHeader: "Bearer malformed-token",
      });

      try {
        await authenticateRequest(req);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect((error as UnauthorizedError).message).toContain(
          "Authentication failed",
        );
        expect((error as UnauthorizedError).message).toContain(
          "JWT malformed",
        );
      }
    });
  });
});

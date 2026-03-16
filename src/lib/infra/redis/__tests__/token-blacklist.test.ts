/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { tokenIsBlacklisted, tokenBlacklist } from "../cache";

/** Mirror the hash function used in cache.ts */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Mock the Redis client
vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(),
}));

import { getRedisClient } from "@/lib/infra/redis/client";

const mockedGetRedisClient = vi.mocked(getRedisClient);

describe("Token Blacklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tokenIsBlacklisted", () => {
    it("returns true when token exists in Redis blacklist", async () => {
      mockedGetRedisClient.mockReturnValue({
        exists: vi.fn().mockResolvedValue(1),
      } as any);

      const result = await tokenIsBlacklisted("blacklisted-token");
      expect(result).toBe(true);
    });

    it("returns false when token is not in Redis blacklist", async () => {
      mockedGetRedisClient.mockReturnValue({
        exists: vi.fn().mockResolvedValue(0),
      } as any);

      const result = await tokenIsBlacklisted("valid-token");
      expect(result).toBe(false);
    });

    it("fails OPEN when Redis is down (returns false)", async () => {
      // When Redis is unavailable, tokenIsBlacklisted returns FALSE
      // to keep the app functional. JWT tokens are already cryptographically
      // verified and short-lived (15 min), so failing closed would make the
      // entire app unusable during Redis outages.
      mockedGetRedisClient.mockReturnValue({
        exists: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      } as any);

      const result = await tokenIsBlacklisted("any-token");
      expect(result).toBe(false); // FAIL OPEN — allow token through
    });

    it("fails OPEN on timeout (returns false)", async () => {
      mockedGetRedisClient.mockReturnValue({
        exists: vi.fn().mockRejectedValue(new Error("Redis timeout")),
      } as any);

      const result = await tokenIsBlacklisted("any-token");
      expect(result).toBe(false); // FAIL OPEN
    });

    it("checks the correct Redis key format", async () => {
      const mockExists = vi.fn().mockResolvedValue(0);
      mockedGetRedisClient.mockReturnValue({
        exists: mockExists,
      } as any);

      await tokenIsBlacklisted("my-jwt-token-123");
      expect(mockExists).toHaveBeenCalledWith(`token:blacklist:${hashToken("my-jwt-token-123")}`);
    });
  });

  describe("tokenBlacklist", () => {
    it("adds a token to the blacklist with correct TTL", async () => {
      const mockSet = vi.fn().mockResolvedValue("OK");
      mockedGetRedisClient.mockReturnValue({
        set: mockSet,
      } as any);

      await tokenBlacklist("expired-token", 3600);
      expect(mockSet).toHaveBeenCalledWith(
        `token:blacklist:${hashToken("expired-token")}`,
        "1",
        "EX",
        3600,
      );
    });

    it("does not throw when Redis is down (graceful degradation for blacklisting)", async () => {
      mockedGetRedisClient.mockReturnValue({
        set: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      } as any);

      // Should not throw — logout should still proceed client-side
      await expect(tokenBlacklist("some-token", 3600)).resolves.not.toThrow();
    });
  });
});

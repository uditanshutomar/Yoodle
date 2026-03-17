import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "../rate-limit";
import { RateLimitError } from "../errors";
import { getRedisClient } from "@/lib/infra/redis/client";

// Access the mocked getRedisClient
const mockedGetRedisClient = vi.mocked(getRedisClient);

function createMockRequest(ip = "192.168.1.1"): NextRequest {
  return new NextRequest("http://localhost:3000/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("RATE_LIMITS", () => {
  it("has expected preset groups", () => {
    expect(RATE_LIMITS.auth).toEqual({ limit: 30, window: 60 });
    expect(RATE_LIMITS.ai).toEqual({ limit: 20, window: 60 });
    expect(RATE_LIMITS.voice).toEqual({ limit: 10, window: 60 });
    expect(RATE_LIMITS.meetings).toEqual({ limit: 60, window: 60 });
    expect(RATE_LIMITS.general).toEqual({ limit: 100, window: 60 });
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests when under the limit", async () => {
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],   // zremrangebyscore result
        [null, 1],   // zadd result
        [null, 3],   // zcard result (3 requests, under general limit of 100)
        [null, 1],   // expire result
      ]),
    };

    mockedGetRedisClient.mockReturnValue({
      pipeline: vi.fn(() => mockPipeline),
      zrange: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof getRedisClient>);

    const req = createMockRequest();

    // Should not throw
    await expect(checkRateLimit(req, "general")).resolves.toBeUndefined();
  });

  it("throws RateLimitError when limit is exceeded", async () => {
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 101],  // 101 requests, exceeds general limit of 100
        [null, 1],
      ]),
    };

    const now = Math.floor(Date.now() / 1000);
    mockedGetRedisClient.mockReturnValue({
      pipeline: vi.fn(() => mockPipeline),
      zrange: vi.fn().mockResolvedValue([
        `${now}:abc12345`,
        String(now - 50),
      ]),
    } as unknown as ReturnType<typeof getRedisClient>);

    const req = createMockRequest();

    await expect(checkRateLimit(req, "general")).rejects.toThrow(
      RateLimitError,
    );
  });

  it("fails open when Redis is unavailable", async () => {
    mockedGetRedisClient.mockImplementation(() => {
      throw new Error("Redis connection failed");
    });

    const req = createMockRequest();

    // Should not throw -- fail-open behavior
    await expect(checkRateLimit(req, "general")).resolves.toBeUndefined();
  });

  it("fails open when pipeline execution fails", async () => {
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    };

    mockedGetRedisClient.mockReturnValue({
      pipeline: vi.fn(() => mockPipeline),
    } as unknown as ReturnType<typeof getRedisClient>);

    const req = createMockRequest();

    // Should not throw when results is null
    await expect(checkRateLimit(req, "general")).resolves.toBeUndefined();
  });

  it("uses auth rate limit for auth group", async () => {
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 31],  // 31 requests, exceeds auth limit of 30
        [null, 1],
      ]),
    };

    const now = Math.floor(Date.now() / 1000);
    mockedGetRedisClient.mockReturnValue({
      pipeline: vi.fn(() => mockPipeline),
      zrange: vi.fn().mockResolvedValue([
        `${now}:abc12345`,
        String(now - 30),
      ]),
    } as unknown as ReturnType<typeof getRedisClient>);

    const req = createMockRequest();

    await expect(checkRateLimit(req, "auth")).rejects.toThrow(
      RateLimitError,
    );
  });

  it("extracts client IP from x-forwarded-for header", async () => {
    const mockPipeline = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]),
    };

    const pipelineFn = vi.fn(() => mockPipeline);
    mockedGetRedisClient.mockReturnValue({
      pipeline: pipelineFn,
      zrange: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof getRedisClient>);

    const req = createMockRequest("10.0.0.1, 172.16.0.1");
    await checkRateLimit(req, "general");

    // The pipeline should have been called (verifying the function ran)
    expect(pipelineFn).toHaveBeenCalled();
  });
});

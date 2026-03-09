import { vi } from "vitest";

// Mock environment variables
process.env.JWT_SECRET = "test-jwt-secret-key-for-testing";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.LLM_PROVIDER = "claude";
process.env.LLM_API_KEY = "test-key";

// Mock Redis client
vi.mock("@/lib/redis/client", () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    pipeline: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    zrange: vi.fn().mockResolvedValue([]),
  })),
  isRedisAvailable: vi.fn(() => true),
}));

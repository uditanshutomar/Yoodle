import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies before importing the route ──────────────────

// Use vi.hoisted to declare variables used inside vi.mock factories,
// since vi.mock calls are hoisted to the top of the file.
const mockConnection = vi.hoisted(() => ({ readyState: 1 }));

// Mock the logger (used by with-handler if the health route ever wraps it)
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock connectDB — returns a fake mongoose instance with a connection object
vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue({ connection: mockConnection }),
}));

// Mock Redis client (isRedisAvailable is imported directly by the route)
vi.mock("@/lib/infra/redis/client", () => ({
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
  isRedisAvailable: vi.fn().mockResolvedValue(true),
}));

// Import after mocks are defined
import connectDB from "@/lib/infra/db/client";
import { isRedisAvailable } from "@/lib/infra/redis/client";
const { GET } = await import("../route");

const mockedConnectDB = vi.mocked(connectDB);
const mockedIsRedisAvailable = vi.mocked(isRedisAvailable);

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset defaults: DB connected, Redis available
    mockConnection.readyState = 1;
    mockedConnectDB.mockResolvedValue({ connection: mockConnection } as never);
    mockedIsRedisAvailable.mockResolvedValue(true);
  });

  it("returns 200 with status 'healthy' when DB and Redis are connected", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
  });

  it("returns service status fields for database and redis", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.services).toBeDefined();
    expect(body.services.database).toBe("connected");
    expect(body.services.redis).toBe("connected");
  });

  it("returns timestamp, uptime, and latency fields", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.latency).toBe("number");
  });

  it("returns 503 with status 'degraded' when DB is disconnected", async () => {
    mockConnection.readyState = 0; // 0 = disconnected

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("disconnected");
    expect(body.services.redis).toBe("connected");
  });

  it("returns 503 with status 'degraded' when Redis is disconnected", async () => {
    mockedIsRedisAvailable.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("connected");
    expect(body.services.redis).toBe("disconnected");
  });

  it("returns 503 with status 'degraded' when both services are down", async () => {
    mockConnection.readyState = 0;
    mockedIsRedisAvailable.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("disconnected");
    expect(body.services.redis).toBe("disconnected");
  });

  it("returns 503 with database 'error' when connectDB throws (redis still checked independently)", async () => {
    mockedConnectDB.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("error");
    // Redis is checked independently via Promise.allSettled — not masked by DB failure
    expect(body.services.redis).toBe("connected");
  });

  it("calls connectDB and isRedisAvailable in parallel", async () => {
    await GET();

    expect(mockedConnectDB).toHaveBeenCalledTimes(1);
    expect(mockedIsRedisAvailable).toHaveBeenCalledTimes(1);
  });
});

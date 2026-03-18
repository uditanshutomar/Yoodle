import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMulti = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};

const mockRedis = {
  get: vi.fn(),
  multi: vi.fn(() => mockMulti),
  del: vi.fn(),
};

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { getUnseenCount, incrementUnseen, clearUnseen } from "../proactive-insights";

describe("proactive-insights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getUnseenCount returns 0 when no key", async () => {
    mockRedis.get.mockResolvedValue(null);
    const count = await getUnseenCount("user123");
    expect(count).toBe(0);
    expect(mockRedis.get).toHaveBeenCalledWith("proactive:unseen:user123");
  });

  it("getUnseenCount returns parsed number", async () => {
    mockRedis.get.mockResolvedValue("3");
    const count = await getUnseenCount("user123");
    expect(count).toBe(3);
  });

  it("incrementUnseen pipelines incr and expire atomically", async () => {
    await incrementUnseen("user123");
    expect(mockRedis.multi).toHaveBeenCalled();
    expect(mockMulti.incr).toHaveBeenCalledWith("proactive:unseen:user123");
    expect(mockMulti.expire).toHaveBeenCalledWith("proactive:unseen:user123", 86400);
    expect(mockMulti.exec).toHaveBeenCalled();
  });

  it("clearUnseen deletes the key", async () => {
    await clearUnseen("user123");
    expect(mockRedis.del).toHaveBeenCalledWith("proactive:unseen:user123");
  });
});

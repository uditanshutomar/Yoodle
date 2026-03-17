import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => mockRedis),
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

  it("incrementUnseen calls incr and sets TTL", async () => {
    mockRedis.incr.mockResolvedValue(1);
    await incrementUnseen("user123");
    expect(mockRedis.incr).toHaveBeenCalledWith("proactive:unseen:user123");
    expect(mockRedis.expire).toHaveBeenCalledWith("proactive:unseen:user123", 86400);
  });

  it("clearUnseen deletes the key", async () => {
    await clearUnseen("user123");
    expect(mockRedis.del).toHaveBeenCalledWith("proactive:unseen:user123");
  });
});

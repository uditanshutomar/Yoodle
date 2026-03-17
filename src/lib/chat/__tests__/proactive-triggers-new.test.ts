import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => ({ publish: vi.fn() })),
}));

vi.mock("@/lib/infra/db/models/task", () => ({
  default: { find: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: { findOne: vi.fn().mockResolvedValue(null), find: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }), updateOne: vi.fn() },
}));
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: { create: vi.fn().mockResolvedValue({ _id: "msg1", createdAt: new Date(), senderId: "u1" }), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("@/lib/chat/proactive-limiter", () => ({
  canSendProactive: vi.fn().mockResolvedValue(true),
  isAgentMuted: vi.fn().mockResolvedValue(false),
}));

describe("new proactive triggers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("triggerStaleTasks is exported as a function", async () => {
    const mod = await import("../proactive-triggers");
    expect(typeof mod.triggerStaleTasks).toBe("function");
  });

  it("triggerWeeklyPatternSummary is exported as a function", async () => {
    const mod = await import("../proactive-triggers");
    expect(typeof mod.triggerWeeklyPatternSummary).toBe("function");
  });

  it("triggerUnreadHighlights is exported as a function", async () => {
    const mod = await import("../proactive-triggers");
    expect(typeof mod.triggerUnreadHighlights).toBe("function");
  });

  it("triggerStaleTasks runs without error", async () => {
    const mod = await import("../proactive-triggers");
    await expect(mod.triggerStaleTasks()).resolves.toBeUndefined();
  });

  it("triggerWeeklyPatternSummary runs without error", async () => {
    const mod = await import("../proactive-triggers");
    await expect(mod.triggerWeeklyPatternSummary()).resolves.toBeUndefined();
  });

  it("triggerUnreadHighlights runs without error", async () => {
    const mod = await import("../proactive-triggers");
    await expect(mod.triggerUnreadHighlights()).resolves.toBeUndefined();
  });
});

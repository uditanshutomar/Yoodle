import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockTriggers = {
  triggerMeetingPrep: vi.fn().mockResolvedValue(undefined),
  triggerDeadlineReminders: vi.fn().mockResolvedValue(undefined),
  triggerFollowUpNudges: vi.fn().mockResolvedValue(undefined),
  triggerBlockedTaskAlerts: vi.fn().mockResolvedValue(undefined),
  triggerStaleTasks: vi.fn().mockResolvedValue(undefined),
  triggerWeeklyPatternSummary: vi.fn().mockResolvedValue(undefined),
  triggerUnreadHighlights: vi.fn().mockResolvedValue(undefined),
  triggerScheduledActions: vi.fn().mockResolvedValue(undefined),
  triggerPostMeetingCascade: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/chat/proactive-triggers", () => mockTriggers);

// ── Import route after all mocks ─────────────────────────────────

const { POST } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cron/proactive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      ...headers,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe("POST /api/cron/proactive", () => {
  const VALID_SECRET = "test-cron-secret-123";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", VALID_SECRET);
    Object.values(mockTriggers).forEach((fn) => fn.mockResolvedValue(undefined));
  });

  it("returns 200 with summary when all triggers succeed (x-cron-secret header)", async () => {
    const res = await POST(createRequest({ "x-cron-secret": VALID_SECRET }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(body.data.summary).toHaveLength(9);
    expect(body.data.summary.every((s: { status: string }) => s.status === "fulfilled")).toBe(true);
  });

  it("accepts Authorization Bearer token", async () => {
    const res = await POST(createRequest({ authorization: `Bearer ${VALID_SECRET}` }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
  });

  it("returns 403 with invalid secret", async () => {
    const res = await POST(createRequest({ "x-cron-secret": "wrong-secret" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Unauthorized");
  });

  it("returns 403 with missing secret header", async () => {
    const res = await POST(createRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 500 when CRON_SECRET env var is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await POST(createRequest({ "x-cron-secret": "any" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("reports individual trigger failures in summary", async () => {
    mockTriggers.triggerMeetingPrep.mockRejectedValue(new Error("DB timeout"));
    mockTriggers.triggerStaleTasks.mockRejectedValue(new Error("Connection refused"));

    const res = await POST(createRequest({ "x-cron-secret": VALID_SECRET }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);

    const meetingPrep = body.data.summary.find((s: { trigger: string }) => s.trigger === "meetingPrep");
    expect(meetingPrep.status).toBe("rejected");
    expect(meetingPrep.error).toBe("DB timeout");

    const staleTasks = body.data.summary.find((s: { trigger: string }) => s.trigger === "staleTasks");
    expect(staleTasks.status).toBe("rejected");
    expect(staleTasks.error).toBe("Connection refused");

    // Other triggers should still be fulfilled
    const deadlines = body.data.summary.find((s: { trigger: string }) => s.trigger === "deadlineReminders");
    expect(deadlines.status).toBe("fulfilled");
  });

  it("calls all 9 trigger functions", async () => {
    await POST(createRequest({ "x-cron-secret": VALID_SECRET }));

    expect(mockTriggers.triggerMeetingPrep).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerDeadlineReminders).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerFollowUpNudges).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerBlockedTaskAlerts).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerStaleTasks).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerWeeklyPatternSummary).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerUnreadHighlights).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerScheduledActions).toHaveBeenCalledTimes(1);
    expect(mockTriggers.triggerPostMeetingCascade).toHaveBeenCalledTimes(1);
  });
});

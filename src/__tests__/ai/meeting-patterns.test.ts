import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

/* ─── Mocks ─── */

const mockConnectDB = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/db/client", () => ({
  default: () => mockConnectDB(),
}));

const mockAnalyticsFind = vi.fn();
vi.mock("@/lib/infra/db/models/meeting-analytics", () => ({
  default: {
    find: (...args: unknown[]) => ({
      sort: () => ({
        lean: () => mockAnalyticsFind(...args),
      }),
    }),
  },
}));

const mockMeetingFind = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    find: (...args: unknown[]) => ({
      lean: () => mockMeetingFind(...args),
    }),
  },
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { analyzeMeetingPatterns } from "@/lib/ai/meeting-patterns";
import type { PatternInsight } from "@/lib/ai/meeting-patterns";

/* ─── Fixtures ─── */

const USER_ID = "507f1f77bcf86cd799439011";

const meetingId1 = new mongoose.Types.ObjectId();
const meetingId2 = new mongoose.Types.ObjectId();
const meetingId3 = new mongoose.Types.ObjectId();
const meetingId4 = new mongoose.Types.ObjectId();

function makeAnalytics(overrides: Record<string, unknown> = {}) {
  return {
    meetingId: meetingId1,
    userId: new mongoose.Types.ObjectId(USER_ID),
    duration: 1800, // 30 min in seconds
    participantCount: 4,
    speakerStats: [
      { userId: "u1", name: "Alice", talkTimePercent: 40, talkTimeSeconds: 720, wordCount: 500, interruptionCount: 2, sentimentAvg: 0.5 },
      { userId: "u2", name: "Bob", talkTimePercent: 35, talkTimeSeconds: 630, wordCount: 400, interruptionCount: 1, sentimentAvg: 0.3 },
      { userId: "u3", name: "Carol", talkTimePercent: 25, talkTimeSeconds: 450, wordCount: 300, interruptionCount: 0, sentimentAvg: 0.6 },
    ],
    agendaCoverage: 80,
    decisionCount: 3,
    actionItemCount: 5,
    actionItemsCompleted: 4,
    meetingScore: 75,
    scoreBreakdown: { agendaCoverage: 80, decisionDensity: 70, actionItemClarity: 75, participationBalance: 75 },
    highlights: [],
    sheetRowAppended: false,
    createdAt: new Date("2026-03-10"),
    ...overrides,
  };
}

/* ─── Tests ─── */

describe("analyzeMeetingPatterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsFind.mockResolvedValue([]);
    mockMeetingFind.mockResolvedValue([]);
  });

  it("exports analyzeMeetingPatterns as a function", () => {
    expect(typeof analyzeMeetingPatterns).toBe("function");
  });

  it("returns empty array when no analytics data", async () => {
    mockAnalyticsFind.mockResolvedValue([]);

    const result = await analyzeMeetingPatterns(USER_ID);

    expect(result).toEqual([]);
  });

  it("detects duration drift when avg duration exceeds scheduled by 20%+", async () => {
    const analytics = [
      makeAnalytics({ meetingId: meetingId1, duration: 2400 }), // 40 min
      makeAnalytics({ meetingId: meetingId2, duration: 2700 }), // 45 min
    ];
    mockAnalyticsFind.mockResolvedValue(analytics);

    // Meetings with 30 min scheduled duration
    mockMeetingFind.mockResolvedValue([
      { _id: meetingId1, title: "Standup", scheduledDuration: 30 },
      { _id: meetingId2, title: "Standup", scheduledDuration: 30 },
    ]);

    const result = await analyzeMeetingPatterns(USER_ID);

    const driftInsights = result.filter((r) => r.type === "duration_drift");
    expect(driftInsights.length).toBe(1);
    expect(driftInsights[0].severity).toBe("warning");
    expect(driftInsights[0].message).toContain("Standup");
  });

  it("does NOT flag duration drift when within 20% tolerance", async () => {
    const analytics = [
      makeAnalytics({ meetingId: meetingId1, duration: 1900 }), // ~31.6 min
      makeAnalytics({ meetingId: meetingId2, duration: 2000 }), // ~33.3 min
    ];
    mockAnalyticsFind.mockResolvedValue(analytics);

    mockMeetingFind.mockResolvedValue([
      { _id: meetingId1, title: "Standup", scheduledDuration: 30 },
      { _id: meetingId2, title: "Standup", scheduledDuration: 30 },
    ]);

    const result = await analyzeMeetingPatterns(USER_ID);

    const driftInsights = result.filter((r) => r.type === "duration_drift");
    expect(driftInsights.length).toBe(0);
  });

  it("detects score trend when recent scores are below average", async () => {
    const analytics = [
      makeAnalytics({ meetingId: meetingId1, meetingScore: 50, createdAt: new Date("2026-03-15") }),
      makeAnalytics({ meetingId: meetingId2, meetingScore: 55, createdAt: new Date("2026-03-14") }),
      makeAnalytics({ meetingId: meetingId3, meetingScore: 45, createdAt: new Date("2026-03-13") }),
      makeAnalytics({ meetingId: meetingId4, meetingScore: 85, createdAt: new Date("2026-03-05") }),
    ];
    mockAnalyticsFind.mockResolvedValue(analytics);
    mockMeetingFind.mockResolvedValue([
      { _id: meetingId1, title: "M1" },
      { _id: meetingId2, title: "M2" },
      { _id: meetingId3, title: "M3" },
      { _id: meetingId4, title: "M4" },
    ]);

    const result = await analyzeMeetingPatterns(USER_ID);

    const trendInsights = result.filter((r) => r.type === "score_trend");
    expect(trendInsights.length).toBe(1);
    expect(trendInsights[0].severity).toBe("warning");
    expect(trendInsights[0].message).toContain("below");
  });

  it("detects participation imbalance when speaker has >60% talk time", async () => {
    const analytics = [
      makeAnalytics({
        meetingId: meetingId1,
        speakerStats: [
          { userId: "u1", name: "Alice", talkTimePercent: 75, talkTimeSeconds: 1350, wordCount: 800, interruptionCount: 5, sentimentAvg: 0.2 },
          { userId: "u2", name: "Bob", talkTimePercent: 25, talkTimeSeconds: 450, wordCount: 200, interruptionCount: 0, sentimentAvg: 0.5 },
        ],
      }),
    ];
    mockAnalyticsFind.mockResolvedValue(analytics);
    mockMeetingFind.mockResolvedValue([
      { _id: meetingId1, title: "1:1 Review" },
    ]);

    const result = await analyzeMeetingPatterns(USER_ID);

    const imbalanceInsights = result.filter(
      (r) => r.type === "participation_imbalance",
    );
    expect(imbalanceInsights.length).toBe(1);
    expect(imbalanceInsights[0].severity).toBe("info");
    expect(imbalanceInsights[0].message).toContain("Alice");
    expect(imbalanceInsights[0].message).toContain("75%");
  });

  it("detects overdue actions when completion rate < 50%", async () => {
    const analytics = [
      makeAnalytics({
        meetingId: meetingId1,
        actionItemCount: 10,
        actionItemsCompleted: 2,
      }),
      makeAnalytics({
        meetingId: meetingId2,
        actionItemCount: 6,
        actionItemsCompleted: 1,
      }),
    ];
    mockAnalyticsFind.mockResolvedValue(analytics);
    mockMeetingFind.mockResolvedValue([
      { _id: meetingId1, title: "M1" },
      { _id: meetingId2, title: "M2" },
    ]);

    const result = await analyzeMeetingPatterns(USER_ID);

    const overduInsights = result.filter((r) => r.type === "overdue_actions");
    expect(overduInsights.length).toBe(1);
    expect(overduInsights[0].severity).toBe("warning");
    expect(overduInsights[0].message).toContain("19%");
  });

  it("returns multiple insight types when multiple patterns detected", async () => {
    const analytics = [
      makeAnalytics({
        meetingId: meetingId1,
        duration: 3600,
        meetingScore: 40,
        actionItemCount: 10,
        actionItemsCompleted: 2,
        speakerStats: [
          { userId: "u1", name: "Alice", talkTimePercent: 80, talkTimeSeconds: 2880, wordCount: 1000, interruptionCount: 5, sentimentAvg: 0.2 },
        ],
        createdAt: new Date("2026-03-15"),
      }),
      makeAnalytics({
        meetingId: meetingId2,
        duration: 3600,
        meetingScore: 35,
        actionItemCount: 8,
        actionItemsCompleted: 1,
        createdAt: new Date("2026-03-14"),
      }),
      makeAnalytics({
        meetingId: meetingId3,
        duration: 3600,
        meetingScore: 45,
        actionItemCount: 6,
        actionItemsCompleted: 0,
        createdAt: new Date("2026-03-13"),
      }),
      makeAnalytics({
        meetingId: meetingId4,
        duration: 3600,
        meetingScore: 90,
        actionItemCount: 4,
        actionItemsCompleted: 4,
        createdAt: new Date("2026-03-05"),
      }),
    ];
    mockAnalyticsFind.mockResolvedValue(analytics);
    mockMeetingFind.mockResolvedValue([
      { _id: meetingId1, title: "Team Sync", scheduledDuration: 30 },
      { _id: meetingId2, title: "Team Sync", scheduledDuration: 30 },
      { _id: meetingId3, title: "Team Sync", scheduledDuration: 30 },
      { _id: meetingId4, title: "Team Sync", scheduledDuration: 30 },
    ]);

    const result = await analyzeMeetingPatterns(USER_ID);
    const types = new Set(result.map((r: PatternInsight) => r.type));

    // Should detect at least duration_drift, score_trend, overdue_actions
    expect(types.has("duration_drift")).toBe(true);
    expect(types.has("score_trend")).toBe(true);
    expect(types.has("overdue_actions")).toBe(true);
  });
});

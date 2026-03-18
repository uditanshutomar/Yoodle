import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("mongoose", async () => {
  const actual = await vi.importActual<typeof import("mongoose")>("mongoose");
  return {
    ...actual,
    default: {
      ...actual.default,
      models: {},
      model: vi.fn().mockImplementation((name, schema) => {
        return { modelName: name, schema };
      }),
    },
  };
});

describe("MeetingAnalytics model", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mongoose = await import("mongoose");
    mongoose.default.models = {};
  });

  it("exports a valid Mongoose model", async () => {
    const mod = await import("../meeting-analytics");
    expect(mod.default).toBeDefined();
    expect(mod.default.modelName).toBe("MeetingAnalytics");
  });

  it("schema has required fields", async () => {
    const mod = await import("../meeting-analytics");
    const paths = mod.default.schema.paths;
    expect(paths.meetingId).toBeDefined();
    expect(paths.userId).toBeDefined();
    expect(paths.duration).toBeDefined();
    expect(paths.participantCount).toBeDefined();
    expect(paths.agendaCoverage).toBeDefined();
    expect(paths.decisionCount).toBeDefined();
    expect(paths.actionItemCount).toBeDefined();
    expect(paths.actionItemsCompleted).toBeDefined();
    expect(paths.meetingScore).toBeDefined();
    expect(paths.sheetRowAppended).toBeDefined();
  });

  it("duration defaults to 0", async () => {
    const mod = await import("../meeting-analytics");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const durationPath = mod.default.schema.path("duration") as any;
    expect(durationPath.defaultValue).toBe(0);
  });

  it("meetingScore defaults to 0", async () => {
    const mod = await import("../meeting-analytics");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scorePath = mod.default.schema.path("meetingScore") as any;
    expect(scorePath.defaultValue).toBe(0);
  });

  it("sheetRowAppended defaults to false", async () => {
    const mod = await import("../meeting-analytics");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetPath = mod.default.schema.path("sheetRowAppended") as any;
    expect(sheetPath.defaultValue).toBe(false);
  });

  it("exports HIGHLIGHT_TYPES constant", async () => {
    const mod = await import("../meeting-analytics");
    expect(mod.HIGHLIGHT_TYPES).toEqual([
      "decision",
      "disagreement",
      "commitment",
      "key_point",
    ]);
  });
});

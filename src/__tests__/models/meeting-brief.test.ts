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

describe("MeetingBrief model", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mongoose = await import("mongoose");
    Object.defineProperty(mongoose.default, "models", { value: {}, writable: true });
  });

  it("exports a valid Mongoose model", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-brief"
    );
    expect(mod.default).toBeDefined();
    expect(mod.default.modelName).toBe("MeetingBrief");
  });

  it("schema has required fields", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-brief"
    );
    const paths = mod.default.schema.paths;
    expect(paths.meetingId).toBeDefined();
    expect(paths.userId).toBeDefined();
    expect(paths.status).toBeDefined();
    expect(paths.sources).toBeDefined();
    expect(paths.agendaSuggestions).toBeDefined();
    expect(paths.carryoverItems).toBeDefined();
    expect(paths.generatedAt).toBeDefined();
    expect(paths.googleDocId).toBeDefined();
    expect(paths.googleDocUrl).toBeDefined();
  });

  it("status defaults to generating", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-brief"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusPath = mod.default.schema.path("status") as any;
    expect(statusPath.defaultValue).toBe("generating");
  });

  it("exports source type and status constants", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-brief"
    );
    expect(mod.BRIEF_SOURCE_TYPES).toContain("task");
    expect(mod.BRIEF_SOURCE_TYPES).toContain("email_thread");
    expect(mod.BRIEF_SOURCE_TYPES).toContain("drive_file");
    expect(mod.BRIEF_SOURCE_TYPES).toContain("past_mom");
    expect(mod.BRIEF_SOURCE_TYPES).toContain("calendar_event");
    expect(mod.BRIEF_STATUSES).toContain("generating");
    expect(mod.BRIEF_STATUSES).toContain("ready");
    expect(mod.BRIEF_STATUSES).toContain("stale");
  });
});

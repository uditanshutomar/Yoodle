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

describe("MeetingTemplate model", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mongoose = await import("mongoose");
    mongoose.default.models = {};
  });

  it("exports a valid Mongoose model", async () => {
    const mod = await import("../meeting-template");
    expect(mod.default).toBeDefined();
    expect(mod.default.modelName).toBe("MeetingTemplate");
  });

  it("schema has required fields", async () => {
    const mod = await import("../meeting-template");
    const paths = mod.default.schema.paths;
    expect(paths.userId).toBeDefined();
    expect(paths.name).toBeDefined();
    expect(paths.defaultDuration).toBeDefined();
    expect(paths.agendaSkeleton).toBeDefined();
    expect(paths.preMeetingChecklist).toBeDefined();
    expect(paths.usageCount).toBeDefined();
  });

  it("defaultDuration defaults to 30", async () => {
    const mod = await import("../meeting-template");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const durationPath = mod.default.schema.path("defaultDuration") as any;
    expect(durationPath.defaultValue).toBe(30);
  });

  it("usageCount defaults to 0", async () => {
    const mod = await import("../meeting-template");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usagePath = mod.default.schema.path("usageCount") as any;
    expect(usagePath.defaultValue).toBe(0);
  });

  it("cascadeConfig has correct defaults", async () => {
    const mod = await import("../meeting-template");
    const paths = mod.default.schema.paths;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((paths["cascadeConfig.createMomDoc"] as any).defaultValue).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((paths["cascadeConfig.createTasks"] as any).defaultValue).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((paths["cascadeConfig.sendFollowUpEmail"] as any).defaultValue).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((paths["cascadeConfig.appendToSheet"] as any).defaultValue).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((paths["cascadeConfig.scheduleNextMeeting"] as any).defaultValue).toBe(false);
  });

  it("name has maxlength 200", async () => {
    const mod = await import("../meeting-template");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const namePath = mod.default.schema.path("name") as any;
    const maxlengthValidator = namePath.validators.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.type === "maxlength",
    );
    expect(maxlengthValidator).toBeDefined();
    expect(maxlengthValidator.maxlength).toBe(200);
  });

  it("collection name is meeting_templates", async () => {
    const mod = await import("../meeting-template");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (mod.default.schema as any).options;
    expect(options.collection).toBe("meeting_templates");
  });
});

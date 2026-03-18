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

describe("ScheduledAction model", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mongoose = await import("mongoose");
    mongoose.default.models = {};
  });

  it("exports a valid Mongoose model", async () => {
    const mod = await import("../scheduled-action");
    expect(mod.default).toBeDefined();
    expect(mod.default.modelName).toBe("ScheduledAction");
  });

  it("schema has required fields", async () => {
    const mod = await import("../scheduled-action");
    const paths = mod.default.schema.paths;
    expect(paths.userId).toBeDefined();
    expect(paths.action).toBeDefined();
    expect(paths.triggerAt).toBeDefined();
    expect(paths.status).toBeDefined();
  });

  it("status defaults to pending", async () => {
    const mod = await import("../scheduled-action");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusPath = mod.default.schema.path("status") as any;
    expect(statusPath.defaultValue).toBe("pending");
  });
});

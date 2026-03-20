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

describe("MeetingKnowledge model", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mongoose = await import("mongoose");
    Object.defineProperty(mongoose.default, "models", { value: {}, writable: true });
  });

  it("exports a valid Mongoose model", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-knowledge"
    );
    expect(mod.default).toBeDefined();
    expect(mod.default.modelName).toBe("MeetingKnowledge");
  });

  it("schema has required fields", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-knowledge"
    );
    const paths = mod.default.schema.paths;
    expect(paths.userId).toBeDefined();
    expect(paths.nodeType).toBeDefined();
    expect(paths.key).toBeDefined();
    expect(paths.entries).toBeDefined();
    expect(paths.relatedKeys).toBeDefined();
    expect(paths.lastUpdated).toBeDefined();
  });

  it("nodeType has correct enum values", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-knowledge"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeTypePath = mod.default.schema.path("nodeType") as any;
    expect(nodeTypePath.enumValues).toEqual([
      "topic",
      "decision",
      "person_expertise",
      "action_evolution",
    ]);
  });

  it("key field has trim and lowercase options", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-knowledge"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keyPath = mod.default.schema.path("key") as any;
    expect(keyPath.options.trim).toBe(true);
    expect(keyPath.options.lowercase).toBe(true);
  });

  it("exports KnowledgeNodeType type", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-knowledge"
    );
    // Type export is compile-time only; verify module loads without error
    expect(mod.default).toBeDefined();
  });

  it("relatedKeys defaults to empty array", async () => {
    const mod = await import(
      "../../lib/infra/db/models/meeting-knowledge"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relatedKeysPath = mod.default.schema.path("relatedKeys") as any;
    expect(relatedKeysPath.defaultValue()).toEqual([]);
  });
});

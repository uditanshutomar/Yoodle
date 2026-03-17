import { describe, it, expect } from "vitest";

describe("Board model schema", () => {
  it("has correct collection name and required fields", async () => {
    const { default: Board } = await import("../board");
    const schema = Board.schema;

    expect(schema.path("title")).toBeDefined();
    expect(schema.path("ownerId")).toBeDefined();
    expect(schema.path("scope")).toBeDefined();
    expect(schema.path("members")).toBeDefined();
    expect(schema.path("columns")).toBeDefined();
    expect(schema.path("labels")).toBeDefined();
    expect(Board.modelName).toBe("Board");
  });

  it("scope enum only allows personal and conversation", async () => {
    const { default: Board } = await import("../board");
    const scopePath = Board.schema.path("scope") as any;
    expect(scopePath.enumValues).toEqual(["personal", "conversation"]);
  });
});

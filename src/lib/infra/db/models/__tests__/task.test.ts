import { describe, it, expect } from "vitest";

describe("Task model schema", () => {
  it("has correct required fields", async () => {
    const { default: Task } = await import("../task");
    const schema = Task.schema;

    expect(schema.path("boardId")).toBeDefined();
    expect(schema.path("columnId")).toBeDefined();
    expect(schema.path("position")).toBeDefined();
    expect(schema.path("title")).toBeDefined();
    expect(schema.path("priority")).toBeDefined();
    expect(schema.path("creatorId")).toBeDefined();
    expect(schema.path("subtasks")).toBeDefined();
    expect(schema.path("linkedDocs")).toBeDefined();
  });

  it("priority enum has correct values", async () => {
    const { default: Task } = await import("../task");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priorityPath = Task.schema.path("priority") as any;
    expect(priorityPath.enumValues).toEqual(["urgent", "high", "medium", "low", "none"]);
  });
});

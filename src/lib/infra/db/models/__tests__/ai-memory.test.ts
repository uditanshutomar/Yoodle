import { describe, it, expect } from "vitest";
import { MEMORY_CATEGORIES, MEMORY_SOURCES } from "../ai-memory";

describe("AIMemory schema", () => {
  it("includes project and workflow categories", () => {
    expect(MEMORY_CATEGORIES).toContain("project");
    expect(MEMORY_CATEGORIES).toContain("workflow");
  });

  it("still includes original categories", () => {
    for (const cat of ["preference", "context", "task", "relationship", "habit"]) {
      expect(MEMORY_CATEGORIES).toContain(cat);
    }
  });

  it("includes explicit source", () => {
    expect(MEMORY_SOURCES).toContain("explicit");
  });
});

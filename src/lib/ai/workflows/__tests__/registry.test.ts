import { describe, it, expect } from "vitest";
import { getWorkflow, listWorkflows, matchWorkflow } from "../registry";

describe("workflow registry", () => {
  it("lists all registered workflows", () => {
    const all = listWorkflows();
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((w) => w.id && w.name && w.steps.length > 0)).toBe(true);
  });

  it("gets a workflow by ID", () => {
    const wf = getWorkflow("meeting-prep");
    expect(wf).toBeDefined();
    expect(wf!.name).toContain("Meeting Prep");
  });

  it("returns undefined for unknown ID", () => {
    expect(getWorkflow("does-not-exist")).toBeUndefined();
  });

  it("matches workflow from trigger phrase", () => {
    const wf = matchWorkflow("prep for my meeting");
    expect(wf).toBeDefined();
    expect(wf!.id).toBe("meeting-prep");
  });

  it("returns undefined for no match", () => {
    expect(matchWorkflow("random unrelated text")).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/tools", () => ({
  executeWorkspaceTool: vi.fn().mockResolvedValue({
    success: true,
    summary: "Done",
    data: { items: [] },
  }),
}));
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { executeWorkflow } from "../executor";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import type { WorkflowTemplate } from "../types";

const mockTemplate: WorkflowTemplate = {
  id: "test-wf",
  name: "Test Workflow",
  description: "test",
  triggerPhrases: ["test"],
  steps: [
    {
      id: "step1",
      label: "Step 1",
      toolName: "list_board_tasks",
      buildArgs: () => ({ limit: 5 }),
    },
    {
      id: "step2",
      label: "Step 2",
      toolName: "search_messages",
      buildArgs: (ctx) => ({ query: ctx.stepResults["step1"]?.summary ?? "" }),
    },
  ],
};

describe("executeWorkflow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes all steps and returns completed state", async () => {
    const onProgress = vi.fn();
    const state = await executeWorkflow(
      mockTemplate,
      "user123",
      {},
      onProgress
    );
    expect(state.status).toBe("completed");
    expect(state.steps[0].status).toBe("done");
    expect(state.steps[1].status).toBe("done");
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalled();
  });

  it("aborts workflow when a non-skippable step fails", async () => {
    (executeWorkspaceTool as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: false, summary: "Failed" });
    const state = await executeWorkflow(mockTemplate, "user123", {});
    expect(state.steps[0].status).toBe("error");
    expect(state.steps[1].status).toBe("pending"); // never reached
    expect(state.status).toBe("cancelled");
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(1);
  });

  it("continues past a skippable step failure", async () => {
    const skippableFirst: WorkflowTemplate = {
      ...mockTemplate,
      steps: [
        { ...mockTemplate.steps[0], skippable: true },
        mockTemplate.steps[1],
      ],
    };
    (executeWorkspaceTool as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: false, summary: "Failed" })
      .mockResolvedValueOnce({ success: true, summary: "OK" });
    const state = await executeWorkflow(skippableFirst, "user123", {});
    expect(state.steps[0].status).toBe("error");
    expect(state.steps[1].status).toBe("done");
    expect(state.status).toBe("completed");
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(2);
  });

  it("supports skipping steps", async () => {
    const skippable: WorkflowTemplate = {
      ...mockTemplate,
      steps: [
        { ...mockTemplate.steps[0], skippable: true },
        mockTemplate.steps[1],
      ],
    };
    const state = await executeWorkflow(
      skippable,
      "user123",
      {},
      undefined,
      new Set(["step1"])
    );
    expect(state.steps[0].status).toBe("skipped");
    expect(state.steps[1].status).toBe("done");
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(1);
  });
});

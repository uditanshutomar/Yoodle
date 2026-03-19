# AI Assistant Phase 3: Multi-Step Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a workflow engine that executes multi-step AI workflows (meeting prep, follow-up, sprint wrap-up, daily close-out, handoff), batch operations on multiple items, and user-scheduled actions.

**Architecture:** Workflow templates define ordered steps that reuse existing `executeWorkspaceTool()`. A `workflow-executor.ts` runs steps sequentially, emitting progress cards via the existing SSE/card system. Batch operations use a new `/api/ai/action/batch-confirm` endpoint. Scheduled actions use a `ScheduledAction` Mongoose model + cron trigger.

**Tech Stack:** Next.js App Router, Gemini function calling (`@google/generative-ai`), MongoDB/Mongoose, Redis, Vitest, Tailwind CSS, Framer Motion.

---

### Task 1: ScheduledAction Mongoose Model

**Files:**
- Create: `src/lib/infra/db/models/scheduled-action.ts`
- Test: `src/lib/infra/db/models/__tests__/scheduled-action.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/infra/db/models/__tests__/scheduled-action.test.ts
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
  beforeEach(() => {
    vi.resetModules();
    const mongoose = require("mongoose");
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
    const statusPath = mod.default.schema.path("status") as any;
    expect(statusPath.defaultValue).toBe("pending");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/infra/db/models/__tests__/scheduled-action.test.ts`
Expected: FAIL — module not found

**Step 3: Write the model**

```typescript
// src/lib/infra/db/models/scheduled-action.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IScheduledAction {
  userId: Types.ObjectId;
  action: string;
  args: Record<string, unknown>;
  summary: string;
  triggerAt: Date;
  status: "pending" | "fired" | "cancelled";
  firedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IScheduledActionDocument extends IScheduledAction, Document {
  _id: Types.ObjectId;
}

const scheduledActionSchema = new Schema<IScheduledActionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true, maxlength: 500 },
    triggerAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "fired", "cancelled"],
      default: "pending",
    },
    firedAt: { type: Date },
  },
  { timestamps: true, collection: "scheduled_actions" },
);

scheduledActionSchema.index({ status: 1, triggerAt: 1 });
scheduledActionSchema.index({ userId: 1, status: 1 });

const ScheduledAction: Model<IScheduledActionDocument> =
  mongoose.models.ScheduledAction ||
  mongoose.model<IScheduledActionDocument>("ScheduledAction", scheduledActionSchema);

export default ScheduledAction;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/infra/db/models/__tests__/scheduled-action.test.ts`
Expected: 3 tests PASS

---

### Task 2: Workflow Template Types + Registry

**Files:**
- Create: `src/lib/ai/workflows/types.ts`
- Create: `src/lib/ai/workflows/registry.ts`
- Test: `src/lib/ai/workflows/__tests__/registry.test.ts`

**Step 1: Write the types file (no test needed — pure types)**

```typescript
// src/lib/ai/workflows/types.ts
import type { ToolResult } from "../tools";

export interface WorkflowStep {
  id: string;
  label: string;
  toolName: string;
  buildArgs: (context: WorkflowContext) => Record<string, unknown>;
  skippable?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerPhrases: string[];
  steps: WorkflowStep[];
}

export interface WorkflowContext {
  userId: string;
  entityId?: string;
  entityType?: string;
  stepResults: Record<string, ToolResult>;
  params: Record<string, unknown>;
}

export type StepStatus = "pending" | "in_progress" | "done" | "skipped" | "error";

export interface WorkflowState {
  workflowId: string;
  templateId: string;
  title: string;
  currentStepIndex: number;
  steps: Array<{ id: string; label: string; status: StepStatus; error?: string }>;
  context: WorkflowContext;
  status: "running" | "paused" | "completed" | "cancelled";
}
```

**Step 2: Write the registry test**

```typescript
// src/lib/ai/workflows/__tests__/registry.test.ts
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
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/workflows/__tests__/registry.test.ts`
Expected: FAIL

**Step 4: Write the registry with 5 workflow templates**

See implementation in executor task — registry contains: meeting-prep, meeting-followup, sprint-wrapup, daily-closeout, handoff-package.

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/workflows/__tests__/registry.test.ts`
Expected: 5 tests PASS

---

### Task 3: Workflow Executor

**Files:**
- Create: `src/lib/ai/workflows/executor.ts`
- Test: `src/lib/ai/workflows/__tests__/executor.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/ai/workflows/__tests__/executor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/tools", () => ({
  executeWorkspaceTool: vi.fn().mockResolvedValue({
    success: true, summary: "Done", data: { items: [] },
  }),
}));
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { executeWorkflow } from "../executor";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import type { WorkflowTemplate } from "../types";

const mockTemplate: WorkflowTemplate = {
  id: "test-wf", name: "Test Workflow", description: "test",
  triggerPhrases: ["test"],
  steps: [
    { id: "step1", label: "Step 1", toolName: "list_board_tasks", buildArgs: () => ({ limit: 5 }) },
    { id: "step2", label: "Step 2", toolName: "search_messages", buildArgs: (ctx) => ({ query: ctx.stepResults["step1"]?.summary ?? "" }) },
  ],
};

describe("executeWorkflow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes all steps and returns completed state", async () => {
    const onProgress = vi.fn();
    const state = await executeWorkflow(mockTemplate, "user123", {}, onProgress);
    expect(state.status).toBe("completed");
    expect(state.steps[0].status).toBe("done");
    expect(state.steps[1].status).toBe("done");
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalled();
  });

  it("marks step as error and continues on tool failure", async () => {
    (executeWorkspaceTool as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: false, summary: "Failed" })
      .mockResolvedValueOnce({ success: true, summary: "OK" });
    const state = await executeWorkflow(mockTemplate, "user123", {});
    expect(state.steps[0].status).toBe("error");
    expect(state.steps[1].status).toBe("done");
    expect(state.status).toBe("completed");
  });

  it("supports skipping steps", async () => {
    const skippable: WorkflowTemplate = {
      ...mockTemplate,
      steps: [{ ...mockTemplate.steps[0], skippable: true }, mockTemplate.steps[1]],
    };
    const state = await executeWorkflow(skippable, "user123", {}, undefined, new Set(["step1"]));
    expect(state.steps[0].status).toBe("skipped");
    expect(state.steps[1].status).toBe("done");
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/workflows/__tests__/executor.test.ts`
Expected: FAIL

**Step 3: Write the executor**

Executor runs steps sequentially, calls `executeWorkspaceTool` for each, accumulates results in context, emits progress via callback.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/workflows/__tests__/executor.test.ts`
Expected: 3 tests PASS

---

### Task 4: WorkflowProgressCard UI Component

**Files:**
- Create: `src/components/ai/cards/WorkflowProgressCard.tsx`
- Modify: `src/components/ai/cards/CardRenderer.tsx`

Stepper UI with animated progress bar, status icons (pending/spinner/check/skip/error), cancel button. Wire into CardRenderer switch.

---

### Task 5: BatchActionCard UI Component

**Files:**
- Create: `src/components/ai/cards/BatchActionCard.tsx`
- Modify: `src/components/ai/cards/CardRenderer.tsx`

Selectable item list with select-all, confirm button, count display. Wire into CardRenderer switch.

---

### Task 6: Batch Confirm API Endpoint

**Files:**
- Create: `src/app/api/ai/action/batch-confirm/route.ts`
- Test: `src/app/api/ai/action/__tests__/batch-confirm.test.ts`

POST endpoint with `withHandler`, validates action against whitelist, loops items calling `executeWorkspaceTool`, returns partial results.

---

### Task 7: Tool Declarations (4 new tools)

**Files:**
- Modify: `src/lib/ai/tools.ts`

Add `start_workflow`, `list_workflows`, `batch_action`, `schedule_action` to `WORKSPACE_TOOLS.functionDeclarations`.

---

### Task 8: Tool Executors (4 new cases)

**Files:**
- Modify: `src/lib/ai/tools.ts`
- Modify: `src/app/api/ai/action/confirm/route.ts`

Add executor switch cases. Wire workflow executor, batch card return, schedule_action with 10-active cap.

---

### Task 9: Scheduled Actions Cron Trigger

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts`
- Modify: `src/lib/chat/proactive-limiter.ts`
- Modify: `src/app/api/cron/proactive/route.ts`
- Test: `src/lib/chat/__tests__/scheduled-actions-trigger.test.ts`

Query due ScheduledActions, fire as proactive messages, mark as fired.

---

### Task 10: Wire Cards to Streaming

**Files:**
- Modify: `src/hooks/useAIChat.ts`

Extract `data.card` from tool results to render workflow_progress and batch_action cards.

---

### Task 11: Export ToolResult Type

**Files:**
- Modify: `src/lib/ai/tools.ts`

Ensure `ToolResult` interface is exported for workflows/types.ts import.

---

### Task 12: Full Build + Test Verification

Run `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Commit all Phase 3 changes.

---

## Files Summary

| Action | File |
|--------|------|
| **Create** | `src/lib/infra/db/models/scheduled-action.ts` |
| **Create** | `src/lib/ai/workflows/types.ts` |
| **Create** | `src/lib/ai/workflows/registry.ts` |
| **Create** | `src/lib/ai/workflows/executor.ts` |
| **Create** | `src/components/ai/cards/WorkflowProgressCard.tsx` |
| **Create** | `src/components/ai/cards/BatchActionCard.tsx` |
| **Create** | `src/app/api/ai/action/batch-confirm/route.ts` |
| **Create** | `src/lib/infra/db/models/__tests__/scheduled-action.test.ts` |
| **Create** | `src/lib/ai/workflows/__tests__/registry.test.ts` |
| **Create** | `src/lib/ai/workflows/__tests__/executor.test.ts` |
| **Create** | `src/app/api/ai/action/__tests__/batch-confirm.test.ts` |
| **Create** | `src/lib/chat/__tests__/scheduled-actions-trigger.test.ts` |
| **Modify** | `src/lib/ai/tools.ts` |
| **Modify** | `src/lib/chat/proactive-triggers.ts` |
| **Modify** | `src/lib/chat/proactive-limiter.ts` |
| **Modify** | `src/app/api/cron/proactive/route.ts` |
| **Modify** | `src/app/api/ai/action/confirm/route.ts` |
| **Modify** | `src/hooks/useAIChat.ts` |
| **Modify** | `src/components/ai/cards/CardRenderer.tsx` |

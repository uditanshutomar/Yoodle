# AI Assistant Enhancement — Phase 3: Multi-Step Workflows, Batch Operations, Scheduled Actions

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-step workflow execution with progress tracking, batch operations with preview, draft-and-polish flows, and scheduled future actions to the AI assistant drawer.

**Architecture:** Create a workflow engine that chains existing tools sequentially with progress streaming via SSE. Add a batch confirm endpoint that loops existing action handlers. Create a ScheduledAction model for time-triggered proactive messages. All workflows reuse existing tools from `tools.ts`.

**Tech Stack:** Next.js API Routes, MongoDB/Mongoose, Redis, Gemini AI (function calling), React, Framer Motion, Vitest

---

## Task 1: Create Workflow Template Types and Registry

**Files:**
- Create: `src/lib/ai/workflows/types.ts`
- Create: `src/lib/ai/workflows/templates.ts`

**Step 1: Create workflow types**

```typescript
// src/lib/ai/workflows/types.ts

export interface WorkflowStep {
  id: string;
  label: string;
  toolName: string;
  /** Function to build tool args from accumulated context */
  buildArgs: (context: WorkflowContext) => Record<string, unknown>;
  /** If true, step is optional and can be skipped */
  optional?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  /** Regex patterns that trigger this workflow */
  triggerPatterns: RegExp[];
  /** Function to extract params from the user message */
  extractParams: (message: string) => Record<string, string>;
  steps: WorkflowStep[];
}

export interface WorkflowContext {
  userId: string;
  params: Record<string, string>;
  /** Results from previous steps, keyed by step id */
  stepResults: Record<string, unknown>;
}

export type WorkflowStepStatus = "pending" | "in_progress" | "done" | "skipped" | "error";

export interface WorkflowState {
  workflowId: string;
  templateId: string;
  title: string;
  steps: Array<{
    id: string;
    label: string;
    status: WorkflowStepStatus;
    result?: unknown;
    error?: string;
  }>;
  currentStepIndex: number;
  status: "running" | "paused" | "completed" | "cancelled" | "error";
}
```

**Step 2: Create workflow templates**

```typescript
// src/lib/ai/workflows/templates.ts

import type { WorkflowTemplate } from "./types";

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "meeting_prep",
    name: "Meeting Prep",
    description: "Prepare for an upcoming meeting with agenda, related tasks, and talking points",
    triggerPatterns: [
      /prep(?:are)?\s+(?:for|me for)\s+(?:my\s+)?(?:next\s+)?(?:upcoming\s+)?meeting/i,
      /get\s+(?:me\s+)?ready\s+for\s+(?:my\s+)?meeting/i,
    ],
    extractParams: () => ({}),
    steps: [
      {
        id: "fetch_meeting",
        label: "Fetching meeting details",
        toolName: "list_calendar_events",
        buildArgs: () => ({ maxResults: 1, timeMin: new Date().toISOString() }),
      },
      {
        id: "fetch_tasks",
        label: "Finding related tasks",
        toolName: "list_board_tasks",
        buildArgs: () => ({ status: "in-progress" }),
      },
      {
        id: "generate_prep",
        label: "Generating talking points",
        toolName: "generate_standup",
        buildArgs: (ctx) => ({
          includeTasks: true,
          meetingContext: JSON.stringify(ctx.stepResults.fetch_meeting),
        }),
      },
    ],
  },
  {
    id: "meeting_followup",
    name: "Meeting Follow-up",
    description: "Create action items and draft follow-up from a completed meeting",
    triggerPatterns: [
      /follow\s*up\s+(?:on|from|after)\s+(?:the\s+)?(?:last\s+)?meeting/i,
      /meeting\s+follow\s*up/i,
    ],
    extractParams: () => ({}),
    steps: [
      {
        id: "summarize",
        label: "Summarizing meeting",
        toolName: "summarize_conversation",
        buildArgs: () => ({}),
      },
      {
        id: "create_tasks",
        label: "Creating action items",
        toolName: "create_tasks_from_meeting",
        buildArgs: (ctx) => ({
          summary: ctx.stepResults.summarize,
        }),
      },
    ],
  },
  {
    id: "daily_closeout",
    name: "Daily Close-out",
    description: "Wrap up the day — log what's done, flag stale items, prep for tomorrow",
    triggerPatterns: [
      /wrap\s+up\s+(?:my\s+)?day/i,
      /daily\s+close\s*out/i,
      /end\s+of\s+day\s+(?:summary|wrap)/i,
    ],
    extractParams: () => ({}),
    steps: [
      {
        id: "completed_tasks",
        label: "Checking completed tasks",
        toolName: "list_board_tasks",
        buildArgs: () => ({ status: "done" }),
      },
      {
        id: "pending_tasks",
        label: "Finding pending tasks",
        toolName: "list_board_tasks",
        buildArgs: () => ({ status: "in-progress" }),
      },
      {
        id: "generate_summary",
        label: "Generating daily summary",
        toolName: "generate_standup",
        buildArgs: (ctx) => ({
          completed: JSON.stringify(ctx.stepResults.completed_tasks),
          pending: JSON.stringify(ctx.stepResults.pending_tasks),
        }),
      },
    ],
  },
];

/**
 * Match a user message against workflow templates.
 * Returns the first matching template or undefined.
 */
export function matchWorkflow(message: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) =>
    t.triggerPatterns.some((p) => p.test(message))
  );
}
```

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/ai/workflows/types.ts src/lib/ai/workflows/templates.ts
git commit -m "feat(ai): add workflow template types and 3 built-in workflow definitions"
```

---

## Task 2: Build Workflow Executor

**Files:**
- Create: `src/lib/ai/workflows/executor.ts`

**Step 1: Create the executor**

```typescript
// src/lib/ai/workflows/executor.ts

import { createLogger } from "@/lib/infra/logger";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import type {
  WorkflowTemplate,
  WorkflowState,
  WorkflowContext,
  WorkflowStepStatus,
} from "./types";

const log = createLogger("workflow-executor");

export type WorkflowEvent =
  | { type: "workflow_start"; state: WorkflowState }
  | { type: "step_start"; stepIndex: number; label: string }
  | { type: "step_done"; stepIndex: number; result: unknown }
  | { type: "step_error"; stepIndex: number; error: string }
  | { type: "workflow_done"; state: WorkflowState }
  | { type: "workflow_error"; error: string }
  | string; // text chunks

/**
 * Execute a workflow template step-by-step, yielding progress events.
 * Events are streamed via the same SSE mechanism as regular chat.
 */
export async function* executeWorkflow(
  template: WorkflowTemplate,
  userId: string,
  params: Record<string, string>,
): AsyncGenerator<WorkflowEvent> {
  const workflowId = `wf-${Date.now()}-${template.id}`;

  const state: WorkflowState = {
    workflowId,
    templateId: template.id,
    title: template.name,
    steps: template.steps.map((s) => ({
      id: s.id,
      label: s.label,
      status: "pending" as WorkflowStepStatus,
    })),
    currentStepIndex: 0,
    status: "running",
  };

  const context: WorkflowContext = {
    userId,
    params,
    stepResults: {},
  };

  yield { type: "workflow_start", state: { ...state } };

  for (let i = 0; i < template.steps.length; i++) {
    const step = template.steps[i];
    state.currentStepIndex = i;
    state.steps[i].status = "in_progress";

    yield { type: "step_start", stepIndex: i, label: step.label };

    try {
      const args = step.buildArgs(context);
      const result = await executeWorkspaceTool(userId, step.toolName, args);

      context.stepResults[step.id] = result.data || result;
      state.steps[i].status = "done";
      state.steps[i].result = result.summary;

      yield { type: "step_done", stepIndex: i, result: result.summary };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, step: step.id, workflowId }, "Workflow step failed");

      if (step.optional) {
        state.steps[i].status = "skipped";
        state.steps[i].error = errMsg;
        yield { type: "step_error", stepIndex: i, error: `Skipped: ${errMsg}` };
      } else {
        state.steps[i].status = "error";
        state.steps[i].error = errMsg;
        state.status = "error";
        yield { type: "step_error", stepIndex: i, error: errMsg };
        yield { type: "workflow_error", error: `Failed at step "${step.label}": ${errMsg}` };
        return;
      }
    }
  }

  state.status = "completed";
  yield { type: "workflow_done", state: { ...state } };
}
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/ai/workflows/executor.ts
git commit -m "feat(ai): add workflow executor with step-by-step progress streaming"
```

---

## Task 3: Build WorkflowProgressCard Component

**Files:**
- Create: `src/components/ai/cards/WorkflowProgressCard.tsx`
- Modify: `src/components/ai/cards/CardRenderer.tsx` (add workflow_progress case)

**Step 1: Create WorkflowProgressCard**

```typescript
"use client";

import { Check, Loader2, X, SkipForward, Circle } from "lucide-react";
import { motion } from "framer-motion";
import type { WorkflowProgressCardData } from "./types";

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <Check size={11} className="text-green-500" />,
  in_progress: <Loader2 size={11} className="animate-spin text-[#FFE600]" />,
  pending: <Circle size={11} className="text-[var(--text-muted)]" />,
  skipped: <SkipForward size={11} className="text-[var(--text-muted)]" />,
  error: <X size={11} className="text-red-500" />,
};

export default function WorkflowProgressCard({ data }: { data: WorkflowProgressCardData }) {
  const completedCount = data.steps.filter((s) => s.status === "done").length;
  const progress = data.steps.length > 0 ? (completedCount / data.steps.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {data.title}
        </p>
        <span className="text-[10px] text-[var(--text-muted)]">
          {completedCount}/{data.steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[var(--surface-hover)] mb-3">
        <motion.div
          className="h-full rounded-full bg-[#FFE600]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        {data.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="shrink-0">{STATUS_ICON[step.status]}</span>
            <span
              className={`text-[11px] ${
                step.status === "done"
                  ? "text-[var(--text-muted)] line-through"
                  : step.status === "in_progress"
                    ? "text-[var(--text-primary)] font-medium"
                    : "text-[var(--text-secondary)]"
              }`}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
```

**Step 2: Add to CardRenderer**

In `src/components/ai/cards/CardRenderer.tsx`, add import:
```typescript
import WorkflowProgressCard from "./WorkflowProgressCard";
```

Add case in the switch statement (before `default`):
```typescript
          case "workflow_progress":
            return <WorkflowProgressCard key={key} data={card} />;
```

Update barrel export in `src/components/ai/cards/index.ts`:
```typescript
export { default as WorkflowProgressCard } from "./WorkflowProgressCard";
```

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/ai/cards/WorkflowProgressCard.tsx src/components/ai/cards/CardRenderer.tsx src/components/ai/cards/index.ts
git commit -m "feat(ai): add WorkflowProgressCard component and wire into CardRenderer"
```

---

## Task 4: Create Batch Action Confirm Endpoint

**Files:**
- Create: `src/app/api/ai/action/batch-confirm/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { successResponse } from "@/lib/infra/api/response";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:batch-confirm");

const batchSchema = z.object({
  actionType: z.string().min(1),
  items: z.array(
    z.object({
      id: z.string(),
      args: z.record(z.string(), z.unknown()),
    })
  ).min(1).max(50),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = batchSchema.parse(await req.json());

  const results = await Promise.allSettled(
    body.items.map(async (item) => {
      const result = await executeWorkspaceTool(userId, body.actionType, item.args);
      return { id: item.id, ...result };
    })
  );

  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    details: results.map((r, i) => ({
      id: body.items[i].id,
      status: r.status,
      result: r.status === "fulfilled" ? r.value : undefined,
      error: r.status === "rejected" ? (r.reason as Error).message : undefined,
    })),
  };

  log.info({ actionType: body.actionType, ...summary }, "Batch action completed");

  return successResponse(summary);
});
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/ai/action/batch-confirm/route.ts
git commit -m "feat(ai): add batch action confirm endpoint with per-item error handling"
```

---

## Task 5: Build BatchActionCard Component

**Files:**
- Create: `src/components/ai/cards/BatchActionCard.tsx`
- Modify: `src/components/ai/cards/types.ts` (add BatchActionCardData)
- Modify: `src/components/ai/cards/CardRenderer.tsx` (add batch_action case)

**Step 1: Add BatchActionCardData to types**

In `src/components/ai/cards/types.ts`, add:

```typescript
export interface BatchActionCardData extends BaseCard {
  type: "batch_action";
  actionType: string;
  actionLabel: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    args: Record<string, unknown>;
  }>;
}
```

Update the `CardData` union to include `BatchActionCardData`.

**Step 2: Create BatchActionCard**

```typescript
"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { BatchActionCardData } from "./types";

interface BatchActionCardProps {
  data: BatchActionCardData;
  onConfirm?: (actionType: string, items: Array<{ id: string; args: Record<string, unknown> }>) => void;
}

export default function BatchActionCard({ data, onConfirm }: BatchActionCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(data.items.map((i) => i.id)));
  const [status, setStatus] = useState<"selecting" | "confirming" | "done">("selecting");

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  const handleConfirm = async () => {
    setStatus("confirming");
    const items = data.items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, args: i.args }));
    await onConfirm?.(data.actionType, items);
    setStatus("done");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {data.actionLabel}
        </p>
        {status === "selecting" && (
          <button onClick={toggleAll} className="text-[10px] text-[#B8A200] hover:text-[#FFE600] transition-colors">
            {selected.size === data.items.length ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {data.items.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggleItem(item.id)}
              disabled={status !== "selecting"}
              className="rounded border-[var(--border-strong)] text-[#FFE600] focus:ring-[#FFE600]"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[var(--text-primary)] truncate">{item.title}</p>
              {item.subtitle && (
                <p className="text-[9px] text-[var(--text-muted)] truncate">{item.subtitle}</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {status === "selecting" && (
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold py-1.5 px-3 border-2 border-green-600 shadow-[2px_2px_0_#166534] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Check size={12} /> Apply to {selected.size} selected
          </button>
          <button
            onClick={() => setStatus("done")}
            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {status === "confirming" && (
        <div className="flex items-center gap-2 mt-2.5 text-[11px] text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Processing {selected.size} items...
        </div>
      )}

      {status === "done" && (
        <div className="flex items-center gap-2 mt-2.5 text-[11px] text-green-500 font-semibold">
          <Check size={12} /> Completed
        </div>
      )}
    </motion.div>
  );
}
```

**Step 3: Wire into CardRenderer**

Add import and case:
```typescript
import BatchActionCard from "./BatchActionCard";
// ...
          case "batch_action":
            return <BatchActionCard key={key} data={card} />;
```

Update barrel export:
```typescript
export { default as BatchActionCard } from "./BatchActionCard";
```

**Step 4: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/ai/cards/BatchActionCard.tsx src/components/ai/cards/types.ts src/components/ai/cards/CardRenderer.tsx src/components/ai/cards/index.ts
git commit -m "feat(ai): add BatchActionCard component with select/deselect and batch confirm"
```

---

## Task 6: Create ScheduledAction Model and Endpoints

**Files:**
- Create: `src/lib/infra/db/models/scheduled-action.ts`
- Create: `src/app/api/ai/scheduled-actions/route.ts`

**Step 1: Create the model**

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IScheduledAction {
  userId: Types.ObjectId;
  description: string;
  triggerAt: Date;
  status: "pending" | "fired" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

export interface IScheduledActionDocument extends IScheduledAction, Document {
  _id: Types.ObjectId;
}

const scheduledActionSchema = new Schema<IScheduledActionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    description: { type: String, required: true, maxlength: 500 },
    triggerAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "fired", "cancelled"], default: "pending" },
  },
  { timestamps: true, collection: "scheduled_actions" }
);

scheduledActionSchema.index({ userId: 1, status: 1 });
scheduledActionSchema.index({ triggerAt: 1, status: 1 });

const ScheduledAction: Model<IScheduledActionDocument> =
  mongoose.models.ScheduledAction ||
  mongoose.model<IScheduledActionDocument>("ScheduledAction", scheduledActionSchema);

export default ScheduledAction;
```

**Step 2: Create the API endpoint**

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import ScheduledAction from "@/lib/infra/db/models/scheduled-action";

const MAX_ACTIVE_PER_USER = 10;

const createSchema = z.object({
  description: z.string().min(1).max(500),
  triggerAt: z.string().datetime(),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const activeCount = await ScheduledAction.countDocuments({ userId, status: "pending" });
  if (activeCount >= MAX_ACTIVE_PER_USER) {
    throw new BadRequestError(`Maximum ${MAX_ACTIVE_PER_USER} active scheduled actions allowed.`);
  }

  const body = createSchema.parse(await req.json());

  const action = await ScheduledAction.create({
    userId,
    description: body.description,
    triggerAt: new Date(body.triggerAt),
  });

  return successResponse({ id: action._id, triggerAt: action.triggerAt }, 201);
});

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const actions = await ScheduledAction.find({ userId, status: "pending" })
    .sort({ triggerAt: 1 })
    .limit(20)
    .lean();

  return successResponse({ actions });
});
```

**Step 3: Add schedule_action tool to tools.ts**

Add function declaration:
```typescript
    {
      name: "schedule_action",
      description: "Schedule a reminder or action for a future time. Use when the user says 'remind me', 'schedule', or 'in X hours/days'.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING, description: "What to remind or do" },
          triggerAt: { type: SchemaType.STRING, description: "ISO 8601 datetime for when to trigger" },
        },
        required: ["description", "triggerAt"],
      },
    },
```

Add executor case:
```typescript
    case "schedule_action": {
      const ScheduledAction = (await import("@/lib/infra/db/models/scheduled-action")).default;
      const connectDB = (await import("@/lib/infra/db/client")).default;
      await connectDB();

      const activeCount = await ScheduledAction.countDocuments({ userId, status: "pending" });
      if (activeCount >= 10) {
        return { success: false, summary: "Maximum 10 active reminders. Cancel some first." };
      }

      const action = await ScheduledAction.create({
        userId,
        description: (args.description as string).slice(0, 500),
        triggerAt: new Date(args.triggerAt as string),
      });

      const triggerDate = new Date(args.triggerAt as string);
      return {
        success: true,
        summary: `Scheduled: "${(args.description as string).slice(0, 50)}" for ${triggerDate.toLocaleString()}`,
        data: { id: action._id, triggerAt: action.triggerAt },
      };
    }
```

Add to `ALLOWED_ACTION_TYPES` in `confirm/route.ts`: `"schedule_action"`.

Add to `TOOL_DISPLAY` in ChatBubble.tsx:
```typescript
  schedule_action: { label: "Scheduling reminder", icon: Calendar },
```

**Step 4: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/scheduled-action.ts src/app/api/ai/scheduled-actions/route.ts src/lib/ai/tools.ts src/app/api/ai/action/confirm/route.ts src/components/ai/ChatBubble.tsx
git commit -m "feat(ai): add ScheduledAction model, API, and schedule_action tool"
```

---

## Task 7: Add Scheduled Action Trigger to Cron

**Files:**
- Modify: `src/app/api/cron/proactive/route.ts`

**Step 1: Add scheduled action processing**

In `src/lib/chat/proactive-triggers.ts`, add at the end:

```typescript
/* ─── 8. Fire Scheduled Actions ─── */

export async function triggerScheduledActions(): Promise<void> {
  try {
    await connectDB();
    const ScheduledAction = (await import("@/lib/infra/db/models/scheduled-action")).default;
    const ProactiveInsight = (await import("@/lib/infra/db/models/proactive-insight")).default;

    const now = new Date();
    const dueActions = await ScheduledAction.find({
      status: "pending",
      triggerAt: { $lte: now },
    }).limit(50).lean();

    log.info({ count: dueActions.length }, "Scheduled actions: due actions found");

    for (const action of dueActions) {
      try {
        await ProactiveInsight.create({
          userId: action.userId,
          type: "scheduled_reminder",
          title: "Reminder",
          body: action.description,
          actions: [
            { label: "Mark done", prompt: `I've handled the reminder: "${action.description}"` },
            { label: "Snooze 1h", prompt: `Remind me again in 1 hour about: "${action.description}"` },
          ],
          priority: 2,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await ScheduledAction.updateOne(
          { _id: action._id },
          { $set: { status: "fired" } },
        );

        log.info({ actionId: action._id }, "Scheduled action fired");
      } catch (err) {
        log.error({ err, actionId: action._id }, "Scheduled action: error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerScheduledActions failed");
  }
}
```

**Step 2: Add to cron route**

In `src/app/api/cron/proactive/route.ts`, add `triggerScheduledActions` to the import and Promise.allSettled arrays.

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts src/app/api/cron/proactive/route.ts
git commit -m "feat(ai): add scheduled action trigger to fire reminders as proactive insights"
```

---

## Task 8: Full Build Verification

**Step 1: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 2: Run build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Run all tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npx vitest run 2>&1 | tail -20`
Expected: All tests pass

---

## Files Summary

| Action | File |
|--------|------|
| Create | `src/lib/ai/workflows/types.ts` |
| Create | `src/lib/ai/workflows/templates.ts` |
| Create | `src/lib/ai/workflows/executor.ts` |
| Create | `src/components/ai/cards/WorkflowProgressCard.tsx` |
| Create | `src/components/ai/cards/BatchActionCard.tsx` |
| Create | `src/app/api/ai/action/batch-confirm/route.ts` |
| Create | `src/lib/infra/db/models/scheduled-action.ts` |
| Create | `src/app/api/ai/scheduled-actions/route.ts` |
| Modify | `src/components/ai/cards/types.ts` |
| Modify | `src/components/ai/cards/CardRenderer.tsx` |
| Modify | `src/components/ai/cards/index.ts` |
| Modify | `src/lib/ai/tools.ts` |
| Modify | `src/app/api/ai/action/confirm/route.ts` |
| Modify | `src/components/ai/ChatBubble.tsx` |
| Modify | `src/lib/chat/proactive-triggers.ts` |
| Modify | `src/app/api/cron/proactive/route.ts` |

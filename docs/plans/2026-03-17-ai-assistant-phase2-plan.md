# AI Assistant Enhancement — Phase 2: Proactive Intelligence + Context/Memory

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 new proactive trigger types, a notification badge on the FAB, proactive insight queue in the drawer, cross-entity context enrichment, and Memory v2 with new categories and explicit user control.

**Architecture:** Extend the existing proactive trigger system (`proactive-triggers.ts` + cron route) with new trigger functions. Add a lightweight insight storage model and API endpoint. Enhance the agent pipeline's GATHER stage with context enrichment. Upgrade the AIMemory schema with new categories and fields.

**Tech Stack:** Next.js API Routes, MongoDB/Mongoose, Redis, Gemini AI, React, Vitest

---

## Task 1: Upgrade Proactive Limiter — Raise Global Cap + Add New Types

**Files:**
- Modify: `src/lib/chat/proactive-limiter.ts:6-15`

**Step 1: Update constants and types**

In `src/lib/chat/proactive-limiter.ts`, change line 6:
```typescript
const GLOBAL_CAP = 5; // raised from 3 for more trigger types
```

Extend `ProactiveType` (line 9-15):
```typescript
export type ProactiveType =
  | "deadline_reminder"
  | "follow_up_nudge"
  | "meeting_prep"
  | "blocked_task_alert"
  | "weekly_digest"
  | "task_status"
  | "stale_task_nudge"
  | "unread_highlights"
  | "weekly_pattern_summary";
```

**Step 2: Run existing rate-limit tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npx vitest run src/lib/chat --reporter=verbose 2>&1 | tail -20`
Expected: All existing tests still pass

**Step 3: Commit**

```bash
git add src/lib/chat/proactive-limiter.ts
git commit -m "feat(ai): raise proactive global cap to 5 and add new trigger types"
```

---

## Task 2: Create ProactiveInsight Model

**Files:**
- Create: `src/lib/infra/db/models/proactive-insight.ts`

**Step 1: Create the model**

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const INSIGHT_STATUSES = ["pending", "seen", "dismissed", "snoozed", "acted"] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export interface IProactiveInsight {
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  actions: Array<{
    label: string;
    prompt?: string;
    url?: string;
  }>;
  priority: number;
  status: InsightStatus;
  snoozedUntil?: Date;
  relatedEntityId?: string;
  relatedEntityType?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProactiveInsightDocument extends IProactiveInsight, Document {
  _id: Types.ObjectId;
}

const proactiveInsightSchema = new Schema<IProactiveInsightDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    actions: [
      {
        label: { type: String, required: true },
        prompt: { type: String },
        url: { type: String },
      },
    ],
    priority: { type: Number, default: 0 },
    status: { type: String, enum: INSIGHT_STATUSES, default: "pending" },
    snoozedUntil: { type: Date },
    relatedEntityId: { type: String },
    relatedEntityType: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "proactive_insights" }
);

proactiveInsightSchema.index({ userId: 1, status: 1 });
proactiveInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ProactiveInsight: Model<IProactiveInsightDocument> =
  mongoose.models.ProactiveInsight ||
  mongoose.model<IProactiveInsightDocument>("ProactiveInsight", proactiveInsightSchema);

export default ProactiveInsight;
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/infra/db/models/proactive-insight.ts
git commit -m "feat(ai): add ProactiveInsight model for queued proactive cards"
```

---

## Task 3: Create Insights Count API Endpoint

**Files:**
- Create: `src/app/api/ai/insights/count/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { successResponse } from "@/lib/infra/api/response";
import connectDB from "@/lib/infra/db/client";
import ProactiveInsight from "@/lib/infra/db/models/proactive-insight";

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const count = await ProactiveInsight.countDocuments({
    userId,
    status: "pending",
    $or: [
      { snoozedUntil: { $exists: false } },
      { snoozedUntil: { $lte: new Date() } },
    ],
  });

  return successResponse({ count });
});
```

**Step 2: Create dismiss/snooze endpoint**

Create: `src/app/api/ai/insights/[id]/route.ts`

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import ProactiveInsight from "@/lib/infra/db/models/proactive-insight";

const updateSchema = z.object({
  action: z.enum(["dismiss", "snooze", "seen", "acted"]),
});

export const PATCH = withHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context.params;

  const body = updateSchema.parse(await req.json());

  await connectDB();

  const update: Record<string, unknown> = {};
  if (body.action === "dismiss") {
    update.status = "dismissed";
  } else if (body.action === "snooze") {
    update.status = "snoozed";
    update.snoozedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  } else if (body.action === "seen") {
    update.status = "seen";
  } else if (body.action === "acted") {
    update.status = "acted";
  }

  const result = await ProactiveInsight.findOneAndUpdate(
    { _id: id, userId },
    { $set: update },
    { new: true }
  );

  if (!result) throw new BadRequestError("Insight not found");

  return successResponse({ ok: true });
});
```

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src/app/api/ai/insights/count/route.ts src/app/api/ai/insights/\[id\]/route.ts
git commit -m "feat(ai): add insights count and dismiss/snooze API endpoints"
```

---

## Task 4: Add New Proactive Triggers — Stale Task + Weekly Summary + Unread Highlights

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts` (add 3 new exports)
- Modify: `src/app/api/cron/proactive/route.ts:19-32` (add new triggers to cron)

**Step 1: Add the three new trigger functions to proactive-triggers.ts**

Append to the end of `src/lib/chat/proactive-triggers.ts`:

```typescript
/* ─── 5. Stale Task Nudge ─── */

export async function triggerStaleTaskNudges(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const ProactiveInsight = (await import("@/lib/infra/db/models/proactive-insight")).default;

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const tasks = await Task.find({
      completedAt: null,
      updatedAt: { $lte: fiveDaysAgo },
      assigneeId: { $exists: true },
    })
      .limit(30)
      .lean();

    log.info({ count: tasks.length }, "Stale task nudges: tasks found");

    for (const task of tasks) {
      try {
        const assigneeId = task.assigneeId!.toString();
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
        );

        // Create a proactive insight card instead of a DM
        await ProactiveInsight.create({
          userId: task.assigneeId,
          type: "stale_task_nudge",
          title: `Task stale for ${daysSinceUpdate} days`,
          body: `"${task.title}" hasn't been updated in ${daysSinceUpdate} days. Blocked, deprioritized, or need help?`,
          actions: [
            { label: "Open task", url: `/boards?task=${task._id}` },
            { label: "Mark done", prompt: `Mark the task "${task.title}" as done` },
          ],
          priority: daysSinceUpdate > 10 ? 2 : 1,
          relatedEntityId: task._id.toString(),
          relatedEntityType: "task",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });

        log.info({ taskId: task._id, assigneeId }, "Stale task insight created");
      } catch (err) {
        log.error({ err, taskId: task._id }, "Stale task nudge: error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerStaleTaskNudges failed");
  }
}

/* ─── 6. Weekly Pattern Summary ─── */

export async function triggerWeeklyPatternSummary(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
    const User = (await import("@/lib/infra/db/models/user")).default;
    const ProactiveInsight = (await import("@/lib/infra/db/models/proactive-insight")).default;

    // Only on Mondays
    const now = new Date();
    if (now.getDay() !== 1) return;

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const users = await User.find({}, { _id: 1, displayName: 1 }).lean();

    for (const user of users) {
      try {
        const userId = user._id;

        const completedLastWeek = await Task.countDocuments({
          assigneeId: userId,
          completedAt: { $gte: weekAgo },
        });

        const meetingsLastWeek = await Meeting.countDocuments({
          participants: userId,
          scheduledAt: { $gte: weekAgo, $lte: now },
        });

        const dueThisWeek = await Task.countDocuments({
          assigneeId: userId,
          completedAt: null,
          dueDate: { $gte: now, $lte: weekAhead },
        });

        const meetingsThisWeek = await Meeting.countDocuments({
          participants: userId,
          scheduledAt: { $gte: now, $lte: weekAhead },
        });

        const body = `Last week: ${completedLastWeek} tasks completed, ${meetingsLastWeek} meetings. This week: ${dueThisWeek} tasks due, ${meetingsThisWeek} meetings.`;

        await ProactiveInsight.create({
          userId,
          type: "weekly_pattern_summary",
          title: "Weekly Summary",
          body,
          actions: [
            { label: "Plan my week", prompt: "Help me plan my week based on my tasks and meetings" },
          ],
          priority: 0,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
        });

        log.info({ userId: userId.toString() }, "Weekly summary insight created");
      } catch (err) {
        log.error({ err, userId: user._id }, "Weekly summary: user error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerWeeklyPatternSummary failed");
  }
}

/* ─── 7. Unread Conversation Highlights ─── */

export async function triggerUnreadHighlights(): Promise<void> {
  try {
    await connectDB();
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const ProactiveInsight = (await import("@/lib/infra/db/models/proactive-insight")).default;

    // Find conversations with significant unread activity
    const conversations = await Conversation.find({
      type: { $in: ["group", "dm"] },
      lastMessageAt: { $gte: new Date(Date.now() - 4 * 60 * 60 * 1000) }, // active in last 4h
    }).lean();

    const userUnreads = new Map<string, Array<{ name: string; count: number }>>();

    for (const conv of conversations) {
      for (const p of conv.participants) {
        if (p.senderType === "agent") continue;
        const unread = p.unreadCount || 0;
        if (unread < 5) continue;

        const uid = p.userId.toString();
        if (!userUnreads.has(uid)) userUnreads.set(uid, []);
        userUnreads.get(uid)!.push({
          name: conv.name || "Direct Message",
          count: unread,
        });
      }
    }

    for (const [userId, unreads] of userUnreads) {
      try {
        const totalUnread = unreads.reduce((sum, u) => sum + u.count, 0);
        const convNames = unreads.slice(0, 3).map((u) => u.name).join(", ");

        await ProactiveInsight.create({
          userId: new mongoose.Types.ObjectId(userId),
          type: "unread_highlights",
          title: `${unreads.length} conversations need attention`,
          body: `${totalUnread} unread messages across ${convNames}${unreads.length > 3 ? ` and ${unreads.length - 3} more` : ""}`,
          actions: [
            { label: "Catch up", prompt: "Summarize my unread conversations" },
            { label: "View messages", url: "/messages" },
          ],
          priority: 1,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
        });

        log.info({ userId }, "Unread highlights insight created");
      } catch (err) {
        log.error({ err, userId }, "Unread highlights: user error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerUnreadHighlights failed");
  }
}
```

**Step 2: Update the cron route to include new triggers**

In `src/app/api/cron/proactive/route.ts`, update the import and Promise.allSettled block (lines 19-39):

```typescript
    const {
      triggerMeetingPrep,
      triggerDeadlineReminders,
      triggerFollowUpNudges,
      triggerBlockedTaskAlerts,
      triggerStaleTaskNudges,
      triggerWeeklyPatternSummary,
      triggerUnreadHighlights,
    } = await import("@/lib/chat/proactive-triggers");

    const results = await Promise.allSettled([
      triggerMeetingPrep(),
      triggerDeadlineReminders(),
      triggerFollowUpNudges(),
      triggerBlockedTaskAlerts(),
      triggerStaleTaskNudges(),
      triggerWeeklyPatternSummary(),
      triggerUnreadHighlights(),
    ]);

    const names = [
      "meetingPrep",
      "deadlineReminders",
      "followUpNudges",
      "blockedTaskAlerts",
      "staleTaskNudges",
      "weeklyPatternSummary",
      "unreadHighlights",
    ] as const;
```

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -15`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts src/app/api/cron/proactive/route.ts
git commit -m "feat(ai): add stale task, weekly summary, and unread highlights proactive triggers"
```

---

## Task 5: Add FAB Notification Badge

**Files:**
- Modify: `src/components/ai/AIDrawer.tsx:58-90` (AIDrawerFAB)
- Create: `src/hooks/useInsightCount.ts`

**Step 1: Create useInsightCount hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export function useInsightCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/insights/count", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setCount(data.data.count);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000); // poll every 60s
    return () => clearInterval(interval);
  }, [refresh]);

  const clear = useCallback(() => setCount(0), []);

  return { count, refresh, clear };
}
```

**Step 2: Add badge to AIDrawerFAB**

In `src/components/ai/AIDrawer.tsx`, add import:
```typescript
import { useInsightCount } from "@/hooks/useInsightCount";
```

In `AIDrawerFAB` function (line 58), add:
```typescript
  const { count: insightCount } = useInsightCount();
```

After the `<Image>` tag inside the button (after line 86), add:
```typescript
        {insightCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-[var(--background)]"
          >
            {insightCount > 9 ? "9+" : insightCount}
          </motion.span>
        )}
```

Add `relative` to the button's className so the badge positions correctly (change `className="pointer-events-auto flex h-16...` to include `relative`).

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src/hooks/useInsightCount.ts src/components/ai/AIDrawer.tsx
git commit -m "feat(ai): add notification badge to FAB with insight count polling"
```

---

## Task 6: Add Insight Queue to ChatWindow

**Files:**
- Create: `src/components/ai/InsightQueue.tsx`
- Modify: `src/components/ai/ChatWindow.tsx` (add InsightQueue above messages)

**Step 1: Create InsightQueue component**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Clock, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Insight {
  _id: string;
  type: string;
  title: string;
  body: string;
  actions: Array<{ label: string; prompt?: string; url?: string }>;
  priority: number;
}

interface InsightQueueProps {
  onAction: (prompt: string) => void;
}

export default function InsightQueue({ onAction }: InsightQueueProps) {
  const [insights, setInsights] = useState<Insight[]>([]);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/insights?status=pending", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setInsights(data.data.insights || []);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleDismiss = async (id: string) => {
    setInsights((prev) => prev.filter((i) => i._id !== id));
    try {
      await fetch(`/api/ai/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "dismiss" }),
      });
    } catch {
      // Silent fail
    }
  };

  const handleSnooze = async (id: string) => {
    setInsights((prev) => prev.filter((i) => i._id !== id));
    try {
      await fetch(`/api/ai/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "snooze" }),
      });
    } catch {
      // Silent fail
    }
  };

  const handleActionClick = async (insightId: string, action: { prompt?: string; url?: string }) => {
    if (action.prompt) {
      onAction(action.prompt);
      await handleDismiss(insightId);
    } else if (action.url) {
      window.location.href = action.url;
    }
  };

  if (insights.length === 0) return null;

  return (
    <div className="px-4 py-2 space-y-2 border-b border-[var(--border)]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]" style={{ fontFamily: "var(--font-heading)" }}>
        Insights ({insights.length})
      </p>
      <AnimatePresence>
        {insights.slice(0, 3).map((insight) => (
          <motion.div
            key={insight._id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                  {insight.title}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 line-clamp-2" style={{ fontFamily: "var(--font-body)" }}>
                  {insight.body}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => handleSnooze(insight._id)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors" title="Snooze 2h">
                  <Clock size={11} />
                </button>
                <button onClick={() => handleDismiss(insight._id)} className="p-1 text-[var(--text-muted)] hover:text-red-500 transition-colors" title="Dismiss">
                  <X size={11} />
                </button>
              </div>
            </div>
            {insight.actions.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {insight.actions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleActionClick(insight._id, action)}
                    className="flex items-center gap-0.5 text-[10px] font-medium text-[#B8A200] hover:text-[#FFE600] transition-colors"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {action.label} <ChevronRight size={10} />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Add a list endpoint for insights**

Create: `src/app/api/ai/insights/route.ts`

```typescript
import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { successResponse } from "@/lib/infra/api/response";
import connectDB from "@/lib/infra/db/client";
import ProactiveInsight from "@/lib/infra/db/models/proactive-insight";

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const insights = await ProactiveInsight.find({
    userId,
    status: "pending",
    $or: [
      { snoozedUntil: { $exists: false } },
      { snoozedUntil: { $lte: new Date() } },
    ],
  })
    .sort({ priority: -1, createdAt: -1 })
    .limit(10)
    .lean();

  return successResponse({ insights });
});
```

**Step 3: Wire InsightQueue into ChatWindow**

In `src/components/ai/ChatWindow.tsx`, add import:
```typescript
import InsightQueue from "./InsightQueue";
```

Insert BEFORE the messages area `<div className="flex-1 overflow-y-auto...">` (line 100), inside the main container:
```typescript
      {/* Proactive insight queue */}
      <InsightQueue onAction={onSend} />
```

**Step 4: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -15`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/ai/InsightQueue.tsx src/app/api/ai/insights/route.ts src/components/ai/ChatWindow.tsx
git commit -m "feat(ai): add InsightQueue component with list endpoint and wire into ChatWindow"
```

---

## Task 7: Upgrade AIMemory Schema — New Categories + Fields

**Files:**
- Modify: `src/lib/infra/db/models/ai-memory.ts`

**Step 1: Update the schema**

In `src/lib/infra/db/models/ai-memory.ts`:

Update `MEMORY_CATEGORIES` (line 3-9):
```typescript
export const MEMORY_CATEGORIES = [
  "preference",
  "context",
  "task",
  "relationship",
  "habit",
  "project",
  "workflow",
] as const;
```

Update `IAIMemory` interface (line 20-30) to add new fields:
```typescript
export interface IAIMemory {
  userId: Types.ObjectId;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  confidence: number;
  decayRate: number;
  userExplicit: boolean;
  relatedMeetingId?: Types.ObjectId;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Add new fields to the schema (inside the Schema definition, after `confidence`):
```typescript
    decayRate: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1,
    },
    userExplicit: {
      type: Boolean,
      default: false,
    },
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -15`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/infra/db/models/ai-memory.ts
git commit -m "feat(ai): upgrade AIMemory with project/workflow categories, decayRate, userExplicit fields"
```

---

## Task 8: Add remember_this and recall_memory Tools

**Files:**
- Modify: `src/lib/ai/tools.ts` (add 2 new function declarations + executor cases)

**Step 1: Add function declarations**

In `src/lib/ai/tools.ts`, add these to the `WORKSPACE_TOOLS` function declarations array (find the end of the existing declarations, before the closing of the tools array):

```typescript
    {
      name: "remember_this",
      description: "Store an explicit memory from the user. Use when the user says 'remember this', 'keep in mind', or shares important project/workflow context they want you to retain.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          content: { type: SchemaType.STRING, description: "The memory content to store" },
          category: {
            type: SchemaType.STRING,
            description: "Memory category: preference, context, task, relationship, habit, project, or workflow",
          },
        },
        required: ["content", "category"],
      },
    },
    {
      name: "recall_memory",
      description: "Search the user's stored memories by topic or category. Use when the user asks 'what do you remember about X' or when you need context about a project or preference.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: "Topic or keyword to search for" },
          category: {
            type: SchemaType.STRING,
            description: "Optional: filter by category (preference, context, task, relationship, habit, project, workflow)",
          },
        },
        required: ["query"],
      },
    },
```

**Step 2: Add executor cases**

In the `executeWorkspaceTool` switch statement, add:

```typescript
    case "remember_this": {
      const AIMemory = (await import("@/lib/infra/db/models/ai-memory")).default;
      const connectDB = (await import("@/lib/infra/db/client")).default;
      await connectDB();

      const validCategories = ["preference", "context", "task", "relationship", "habit", "project", "workflow"];
      const category = validCategories.includes(args.category as string) ? args.category as string : "context";
      const decayRate = ["project", "workflow"].includes(category) ? 0.2 : 0.5;

      await AIMemory.create({
        userId,
        category,
        content: (args.content as string).slice(0, 4000),
        source: "manual",
        confidence: 0.9,
        decayRate,
        userExplicit: true,
      });

      return {
        success: true,
        summary: `Remembered: "${(args.content as string).slice(0, 50)}..."`,
        data: { stored: true, category },
      };
    }

    case "recall_memory": {
      const AIMemory = (await import("@/lib/infra/db/models/ai-memory")).default;
      const connectDB = (await import("@/lib/infra/db/client")).default;
      await connectDB();

      const filter: Record<string, unknown> = { userId };
      if (args.category) filter.category = args.category;

      const memories = await AIMemory.find(filter)
        .sort({ confidence: -1, updatedAt: -1 })
        .limit(20)
        .lean();

      // Simple keyword search
      const query = (args.query as string).toLowerCase();
      const matched = memories.filter((m) =>
        m.content.toLowerCase().includes(query)
      ).slice(0, 10);

      return {
        success: true,
        summary: `Found ${matched.length} memories matching "${args.query}"`,
        data: {
          memories: matched.map((m) => ({
            category: m.category,
            content: m.content,
            confidence: m.confidence,
            userExplicit: m.userExplicit || false,
            createdAt: m.createdAt,
          })),
        },
      };
    }
```

**Step 3: Add to ALLOWED_ACTION_TYPES in confirm route**

In `src/app/api/ai/action/confirm/route.ts`, add `"remember_this"` and `"recall_memory"` to the `ALLOWED_ACTION_TYPES` Set.

**Step 4: Add tool display entries in ChatBubble.tsx**

In `src/components/ai/ChatBubble.tsx`, add to `TOOL_DISPLAY`:
```typescript
  remember_this: { label: "Saving memory", icon: FileText },
  recall_memory: { label: "Searching memories", icon: Search },
```

**Step 5: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -15`
Expected: No errors

**Step 6: Commit**

```bash
git add src/lib/ai/tools.ts src/app/api/ai/action/confirm/route.ts src/components/ai/ChatBubble.tsx
git commit -m "feat(ai): add remember_this and recall_memory tools with Memory v2 support"
```

---

## Task 9: Create Context Enricher

**Files:**
- Create: `src/lib/ai/context-enricher.ts`

**Step 1: Create the enricher**

```typescript
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("context-enricher");

const MAX_RELATED = 3;

interface RelatedEntity {
  type: string;
  id: string;
  title: string;
  summary?: string;
}

export interface EnrichedContext {
  relatedEntities: RelatedEntity[];
}

/**
 * Enrich a task with related meetings and messages.
 * Depth limit: 1 hop only.
 */
export async function enrichTask(taskId: string): Promise<EnrichedContext> {
  const related: RelatedEntity[] = [];
  try {
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
    const connectDB = (await import("@/lib/infra/db/client")).default;
    await connectDB();

    const task = await Task.findById(taskId).lean();
    if (!task) return { relatedEntities: [] };

    // Related meeting (if task came from a meeting)
    if (task.meetingId) {
      const meeting = await Meeting.findById(task.meetingId, { title: 1, scheduledAt: 1 }).lean();
      if (meeting) {
        related.push({
          type: "meeting",
          id: meeting._id.toString(),
          title: meeting.title,
          summary: `Meeting on ${meeting.scheduledAt?.toLocaleDateString() || "unknown date"}`,
        });
      }
    }
  } catch (err) {
    log.warn({ err, taskId }, "Failed to enrich task context");
  }
  return { relatedEntities: related.slice(0, MAX_RELATED) };
}

/**
 * Enrich a meeting with related tasks.
 */
export async function enrichMeeting(meetingId: string): Promise<EnrichedContext> {
  const related: RelatedEntity[] = [];
  try {
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const connectDB = (await import("@/lib/infra/db/client")).default;
    await connectDB();

    const tasks = await Task.find({ meetingId, completedAt: null }, { title: 1, status: 1 })
      .limit(MAX_RELATED)
      .lean();

    for (const task of tasks) {
      related.push({
        type: "task",
        id: task._id.toString(),
        title: task.title,
        summary: `Status: ${task.status || "unknown"}`,
      });
    }
  } catch (err) {
    log.warn({ err, meetingId }, "Failed to enrich meeting context");
  }
  return { relatedEntities: related };
}

/**
 * Format enriched context as a readable string for the LLM.
 */
export function formatEnrichedContext(enriched: EnrichedContext): string {
  if (enriched.relatedEntities.length === 0) return "";
  const lines = enriched.relatedEntities.map(
    (e) => `- [${e.type}] ${e.title}${e.summary ? ` (${e.summary})` : ""}`
  );
  return `\nRelated context:\n${lines.join("\n")}`;
}
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/ai/context-enricher.ts
git commit -m "feat(ai): add context enricher for cross-entity linking (tasks <-> meetings)"
```

---

## Task 10: Session Persistence — Multiple Sessions in useAIChat

**Files:**
- Modify: `src/hooks/useAIChat.ts:29-52` (storage functions)

**Step 1: Upgrade storage to support 3 sessions**

Replace the storage functions (lines 29-52) with:

```typescript
const STORAGE_KEY = "yoodle-ai-chat-sessions";
const MAX_SESSIONS = 3;

interface StoredSession {
  id: string;
  label: string;
  messages: ChatMessage[];
  createdAt: number;
}

function loadPersistedSessions(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSession[];
    // Only keep sessions from the last 48 hours
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return parsed.filter((s) => s.createdAt > cutoff).slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
}

function loadPersistedMessages(): ChatMessage[] {
  const sessions = loadPersistedSessions();
  if (sessions.length === 0) return [];
  // Return the most recent session's messages
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return sessions[0].messages.filter((m) => m.timestamp > cutoff);
}

function persistMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const sessions = loadPersistedSessions();
    const currentSession: StoredSession = {
      id: sessions[0]?.id || `session-${Date.now()}`,
      label: "Current",
      messages,
      createdAt: sessions[0]?.createdAt || Date.now(),
    };
    const updated = [currentSession, ...sessions.filter((s) => s.id !== currentSession.id)].slice(0, MAX_SESSIONS);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full or unavailable
  }
}
```

Update `clearMessages` (around line 301) to start a new session:
```typescript
  const clearMessages = useCallback(() => {
    // Archive current session before clearing
    if (typeof window !== "undefined" && messages.length > 0) {
      try {
        const sessions = loadPersistedSessions();
        if (sessions.length > 0 && sessions[0].messages.length > 0) {
          const firstMsg = sessions[0].messages[0];
          sessions[0].label = firstMsg.content.slice(0, 40) || "Past session";
          sessions[0].id = `session-archived-${Date.now()}`;
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
        }
      } catch { /* ignore */ }
    }
    setMessages([]);
  }, [messages]);
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useAIChat.ts
git commit -m "feat(ai): upgrade session persistence to support 3 archived sessions"
```

---

## Task 11: Full Build Verification

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
| Modify | `src/lib/chat/proactive-limiter.ts` |
| Create | `src/lib/infra/db/models/proactive-insight.ts` |
| Create | `src/app/api/ai/insights/count/route.ts` |
| Create | `src/app/api/ai/insights/[id]/route.ts` |
| Create | `src/app/api/ai/insights/route.ts` |
| Modify | `src/lib/chat/proactive-triggers.ts` |
| Modify | `src/app/api/cron/proactive/route.ts` |
| Create | `src/hooks/useInsightCount.ts` |
| Modify | `src/components/ai/AIDrawer.tsx` |
| Create | `src/components/ai/InsightQueue.tsx` |
| Modify | `src/components/ai/ChatWindow.tsx` |
| Modify | `src/lib/infra/db/models/ai-memory.ts` |
| Modify | `src/lib/ai/tools.ts` |
| Modify | `src/app/api/ai/action/confirm/route.ts` |
| Modify | `src/components/ai/ChatBubble.tsx` |
| Create | `src/lib/ai/context-enricher.ts` |
| Modify | `src/hooks/useAIChat.ts` |

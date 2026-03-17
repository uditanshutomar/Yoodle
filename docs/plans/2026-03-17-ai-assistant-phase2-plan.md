# AI Assistant Phase 2: Proactive Intelligence + Context/Memory — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 new proactive triggers with FAB notification badge + insight queue, upgrade AI Memory with 2 new categories and explicit memory tools, add cross-entity context enrichment, and session persistence.

**Architecture:** Backend-heavy phase. New proactive trigger functions slot into the existing cron loop. A new `ProactiveInsight` Redis-backed store feeds a notification badge on the FAB and an insight queue in the drawer. Memory schema gets 2 new categories + `decayRate`/`userExplicit` fields. A `context-enricher.ts` utility enriches tool results with related entities. Session persistence is a frontend upgrade to `useAIChat.ts`.

**Tech Stack:** Next.js App Router, MongoDB/Mongoose, Redis (ioredis), Gemini AI function declarations, Vitest, Tailwind CSS, Framer Motion.

---

## Task 1: Upgrade AIMemory Schema

**Files:**
- Modify: `src/lib/infra/db/models/ai-memory.ts`
- Test: `src/lib/infra/db/models/__tests__/ai-memory.test.ts`

**Step 1: Write the failing test**

Create `src/lib/infra/db/models/__tests__/ai-memory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MEMORY_CATEGORIES } from "../ai-memory";

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
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/infra/db/models/__tests__/ai-memory.test.ts`
Expected: FAIL — "project" not in MEMORY_CATEGORIES

**Step 3: Update the AIMemory model**

In `src/lib/infra/db/models/ai-memory.ts`:

1. Add `"project"` and `"workflow"` to `MEMORY_CATEGORIES` array (after `"habit"`)
2. Add `"explicit"` to `MEMORY_SOURCES` array (for user-commanded memories)
3. Add fields to `IAIMemory` interface:
   ```typescript
   decayRate?: number;       // 0-1, lower = slower decay. Default 0.5
   userExplicit?: boolean;   // true if user said "remember this" — exempt from auto-eviction
   ```
4. Add to Mongoose schema:
   ```typescript
   decayRate: { type: Number, min: 0, max: 1, default: 0.5 },
   userExplicit: { type: Boolean, default: false },
   ```
5. Add index for content text search: `aiMemorySchema.index({ userId: 1, content: "text" });`

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/infra/db/models/__tests__/ai-memory.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/ai-memory.ts src/lib/infra/db/models/__tests__/ai-memory.test.ts
git commit -m "feat(ai): add project/workflow memory categories and decay/explicit fields"
```

---

## Task 2: Add Proactive Types to Rate Limiter + Raise Global Cap

**Files:**
- Modify: `src/lib/chat/proactive-limiter.ts`

**Step 1: Update ProactiveType and cap**

In `src/lib/chat/proactive-limiter.ts`:

1. Change `GLOBAL_CAP = 3` to `GLOBAL_CAP = 5`
2. Add new types to `ProactiveType`:
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

**Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/lib/chat/proactive-limiter.ts
git commit -m "feat(ai): raise proactive global cap to 5 and add new trigger types"
```

---

## Task 3: Create Stale Task Nudge Trigger

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts`
- Test: `src/lib/chat/__tests__/proactive-triggers-stale.test.ts`

**Step 1: Write the failing test**

Create `src/lib/chat/__tests__/proactive-triggers-stale.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => ({ publish: vi.fn() })),
}));

const mockTaskFind = vi.fn();
const mockConvFindOne = vi.fn();
const mockDMCreate = vi.fn();
const mockConvUpdateOne = vi.fn();

vi.mock("@/lib/infra/db/models/task", () => ({
  default: { find: mockTaskFind },
}));
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: { findOne: mockConvFindOne, updateOne: mockConvUpdateOne },
}));
vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: { create: mockDMCreate },
}));
vi.mock("@/lib/chat/proactive-limiter", () => ({
  canSendProactive: vi.fn().mockResolvedValue(true),
  isAgentMuted: vi.fn().mockResolvedValue(false),
}));

describe("triggerStaleTasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is exported as a function", async () => {
    const mod = await import("../proactive-triggers");
    expect(typeof mod.triggerStaleTasks).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/__tests__/proactive-triggers-stale.test.ts`
Expected: FAIL — triggerStaleTasks not exported

**Step 3: Implement triggerStaleTasks**

Add to `src/lib/chat/proactive-triggers.ts` after the blocked task alerts section:

```typescript
/* ─── 5. Stale Task Nudge ─── */

export async function triggerStaleTasks(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const tasks = await Task.find({
      completedAt: null,
      updatedAt: { $lte: fiveDaysAgo },
      assigneeId: { $exists: true },
    })
      .limit(15)
      .lean();

    log.info({ count: tasks.length }, "Stale task nudge: tasks found");

    for (const task of tasks) {
      try {
        const assigneeId = task.assigneeId!.toString();

        const conv = await Conversation.findOne({
          "participants.userId": new mongoose.Types.ObjectId(assigneeId),
          "participants.agentEnabled": true,
        }).lean();

        if (!conv) continue;

        const cid = conv._id.toString();
        if (await isAgentMuted(cid, assigneeId)) continue;
        if (!(await canSendProactive(cid, assigneeId, "stale_task_nudge"))) continue;

        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        const content = `"${task.title}" hasn't moved in ${daysSinceUpdate} days. Blocked, deprioritized, or need help?`;

        await postAgentMessage(cid, assigneeId, content);
        log.info({ taskId: task._id, assigneeId }, "Stale task nudge sent");
      } catch (err) {
        log.error({ err, taskId: task._id }, "Stale task nudge: task error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerStaleTasks failed");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/__tests__/proactive-triggers-stale.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts src/lib/chat/__tests__/proactive-triggers-stale.test.ts
git commit -m "feat(ai): add stale task nudge proactive trigger (5+ days inactive)"
```

---

## Task 4: Create Weekly Pattern Summary Trigger

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts`
- Test: `src/lib/chat/__tests__/proactive-triggers-weekly.test.ts`

**Step 1: Write the failing test**

Create `src/lib/chat/__tests__/proactive-triggers-weekly.test.ts` with same mock pattern as Task 3, testing that `triggerWeeklyPatternSummary` is exported and callable.

**Step 2: Run test — expect FAIL**

**Step 3: Implement triggerWeeklyPatternSummary**

Add to `src/lib/chat/proactive-triggers.ts`:

```typescript
/* ─── 6. Weekly Pattern Summary ─── */

export async function triggerWeeklyPatternSummary(): Promise<void> {
  try {
    const now = new Date();
    if (now.getDay() !== 1) {
      log.info("Weekly pattern summary: not Monday, skipping");
      return;
    }

    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const conversations = await Conversation.find({
      "participants.agentEnabled": true,
    })
      .limit(50)
      .lean();

    for (const conv of conversations) {
      for (const p of conv.participants) {
        if (!p.agentEnabled) continue;

        try {
          const uid = p.userId.toString();
          const cid = conv._id.toString();

          if (await isAgentMuted(cid, uid)) continue;
          if (!(await canSendProactive(cid, uid, "weekly_pattern_summary"))) continue;

          const lastWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const thisWeekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          const [completedCount, overdueCount, upcomingMeetings] = await Promise.all([
            Task.countDocuments({
              assigneeId: new mongoose.Types.ObjectId(uid),
              completedAt: { $gte: lastWeekStart, $lte: now },
            }),
            Task.countDocuments({
              assigneeId: new mongoose.Types.ObjectId(uid),
              completedAt: null,
              dueDate: { $lt: now },
            }),
            Meeting.countDocuments({
              "participants.userId": new mongoose.Types.ObjectId(uid),
              status: "scheduled",
              scheduledAt: { $gte: now, $lte: thisWeekEnd },
            }),
          ]);

          const content = `**Weekly Summary**\nLast week: ${completedCount} tasks completed${overdueCount > 0 ? `, ${overdueCount} overdue` : ""}.\nThis week: ${upcomingMeetings} meetings scheduled.`;

          await postAgentMessage(cid, uid, content);
          log.info({ userId: uid }, "Weekly pattern summary sent");
        } catch (err) {
          log.error({ err, convId: conv._id }, "Weekly pattern: participant error");
        }
      }
    }
  } catch (err) {
    log.error({ err }, "triggerWeeklyPatternSummary failed");
  }
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts src/lib/chat/__tests__/proactive-triggers-weekly.test.ts
git commit -m "feat(ai): add weekly pattern summary trigger (Monday only)"
```

---

## Task 5: Create Unread Highlights Trigger

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts`
- Test: `src/lib/chat/__tests__/proactive-triggers-unread.test.ts`

**Step 1: Write failing test** — test that `triggerUnreadHighlights` is exported

**Step 2: Run test — expect FAIL**

**Step 3: Implement triggerUnreadHighlights**

Add to `src/lib/chat/proactive-triggers.ts`:

```typescript
/* ─── 7. Unread Conversation Highlights ─── */

export async function triggerUnreadHighlights(): Promise<void> {
  try {
    await connectDB();
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const conversations = await Conversation.find({
      "participants.agentEnabled": true,
    })
      .limit(50)
      .lean();

    for (const conv of conversations) {
      for (const p of conv.participants) {
        if (!p.agentEnabled) continue;

        try {
          const uid = p.userId.toString();
          const cid = conv._id.toString();

          if (await isAgentMuted(cid, uid)) continue;
          if (!(await canSendProactive(cid, uid, "unread_highlights"))) continue;

          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
          const unreadCount = await DirectMessage.countDocuments({
            conversationId: conv._id,
            senderId: { $ne: new mongoose.Types.ObjectId(uid) },
            createdAt: { $gte: fourHoursAgo },
          });

          if (unreadCount < 5) continue;

          const content = `You have ${unreadCount} new messages in this conversation. Want a quick summary?`;
          await postAgentMessage(cid, uid, content);
          log.info({ userId: uid, unreadCount }, "Unread highlights sent");
        } catch (err) {
          log.error({ err, convId: conv._id }, "Unread highlights: participant error");
        }
      }
    }
  } catch (err) {
    log.error({ err }, "triggerUnreadHighlights failed");
  }
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts src/lib/chat/__tests__/proactive-triggers-unread.test.ts
git commit -m "feat(ai): add unread conversation highlights trigger"
```

---

## Task 6: Wire New Triggers into Cron Endpoint

**Files:**
- Modify: `src/app/api/cron/proactive/route.ts`

**Step 1: Update the cron route**

In `src/app/api/cron/proactive/route.ts`, update the import and `Promise.allSettled` call:

```typescript
const {
  triggerMeetingPrep,
  triggerDeadlineReminders,
  triggerFollowUpNudges,
  triggerBlockedTaskAlerts,
  triggerStaleTasks,
  triggerWeeklyPatternSummary,
  triggerUnreadHighlights,
} = await import("@/lib/chat/proactive-triggers");

const results = await Promise.allSettled([
  triggerMeetingPrep(),
  triggerDeadlineReminders(),
  triggerFollowUpNudges(),
  triggerBlockedTaskAlerts(),
  triggerStaleTasks(),
  triggerWeeklyPatternSummary(),
  triggerUnreadHighlights(),
]);

const names = [
  "meetingPrep",
  "deadlineReminders",
  "followUpNudges",
  "blockedTaskAlerts",
  "staleTasks",
  "weeklyPatternSummary",
  "unreadHighlights",
] as const;
```

**Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/app/api/cron/proactive/route.ts
git commit -m "feat(ai): wire stale/weekly/unread triggers into proactive cron"
```

---

## Task 7: Proactive Insight Count API + Redis Storage

**Files:**
- Create: `src/lib/chat/proactive-insights.ts`
- Create: `src/app/api/ai/insights/count/route.ts`
- Modify: `src/lib/chat/proactive-triggers.ts` (wire incrementUnseen into postAgentMessage)
- Test: `src/lib/chat/__tests__/proactive-insights.test.ts`

**Step 1: Write the failing test**

Create `src/lib/chat/__tests__/proactive-insights.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

import { getUnseenCount, incrementUnseen, clearUnseen } from "../proactive-insights";

describe("proactive-insights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getUnseenCount returns 0 when no key", async () => {
    mockRedis.get.mockResolvedValue(null);
    const count = await getUnseenCount("user123");
    expect(count).toBe(0);
    expect(mockRedis.get).toHaveBeenCalledWith("proactive:unseen:user123");
  });

  it("getUnseenCount returns parsed number", async () => {
    mockRedis.get.mockResolvedValue("3");
    const count = await getUnseenCount("user123");
    expect(count).toBe(3);
  });

  it("incrementUnseen calls incr and sets TTL", async () => {
    mockRedis.incr.mockResolvedValue(1);
    await incrementUnseen("user123");
    expect(mockRedis.incr).toHaveBeenCalledWith("proactive:unseen:user123");
    expect(mockRedis.expire).toHaveBeenCalledWith("proactive:unseen:user123", 86400);
  });

  it("clearUnseen deletes the key", async () => {
    await clearUnseen("user123");
    expect(mockRedis.del).toHaveBeenCalledWith("proactive:unseen:user123");
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run src/lib/chat/__tests__/proactive-insights.test.ts`

**Step 3: Implement proactive-insights.ts**

Create `src/lib/chat/proactive-insights.ts`:

```typescript
import { getRedisClient } from "@/lib/infra/redis/client";

const KEY_PREFIX = "proactive:unseen:";
const TTL_SECONDS = 86400;

export async function getUnseenCount(userId: string): Promise<number> {
  const redis = getRedisClient();
  const val = await redis.get(`${KEY_PREFIX}${userId}`);
  return val ? parseInt(val, 10) : 0;
}

export async function incrementUnseen(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${userId}`;
  await redis.incr(key);
  await redis.expire(key, TTL_SECONDS);
}

export async function clearUnseen(userId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${KEY_PREFIX}${userId}`);
}
```

**Step 4: Run test — expect PASS**

**Step 5: Create the API route**

Create `src/app/api/ai/insights/count/route.ts`:

```typescript
import { withHandler, successResponse } from "@/lib/infra/api/with-handler";
import { getUnseenCount, clearUnseen } from "@/lib/chat/proactive-insights";

export const GET = withHandler(async (_req, { userId }) => {
  const count = await getUnseenCount(userId);
  return successResponse({ count });
});

export const DELETE = withHandler(async (_req, { userId }) => {
  await clearUnseen(userId);
  return successResponse({ ok: true });
});
```

**Step 6: Wire incrementUnseen into postAgentMessage**

In `src/lib/chat/proactive-triggers.ts`, inside `postAgentMessage`, after the Redis publish try/catch block, add:

```typescript
try {
  const { incrementUnseen } = await import("./proactive-insights");
  await incrementUnseen(agentUserId);
} catch {
  /* best-effort */
}
```

**Step 7: Verify build + run tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/chat/__tests__/proactive-insights.test.ts`

**Step 8: Commit**

```bash
git add src/lib/chat/proactive-insights.ts src/lib/chat/__tests__/proactive-insights.test.ts src/app/api/ai/insights/count/route.ts src/lib/chat/proactive-triggers.ts
git commit -m "feat(ai): add proactive insight counter (Redis) with API endpoint"
```

---

## Task 8: Notification Badge on FAB

**Files:**
- Create: `src/hooks/useInsightCount.ts`
- Modify: `src/components/ai/AIDrawer.tsx`

**Step 1: Create the polling hook**

Create `src/hooks/useInsightCount.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export function useInsightCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/insights/count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const clearCount = useCallback(async () => {
    try {
      await fetch("/api/ai/insights/count", { method: "DELETE" });
      setCount(0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [enabled, fetchCount]);

  return { count, clearCount };
}
```

**Step 2: Update AIDrawer.tsx**

In `src/components/ai/AIDrawer.tsx`:

1. Add import: `import { useInsightCount } from "@/hooks/useInsightCount";`
2. In `AIDrawerProvider`, add the hook:
   ```typescript
   const { count: insightCount, clearCount } = useInsightCount(!isOpen);
   ```
3. Pass `insightCount` to FAB: `<AIDrawerFAB onClick={toggle} isOpen={isOpen} insightCount={insightCount} />`
4. Call `clearCount()` in the `open` callback:
   ```typescript
   const open = useCallback(() => { setIsOpen(true); clearCount(); }, [clearCount]);
   ```
5. Update `AIDrawerFAB` signature to accept `insightCount` prop and render badge inside `motion.button`, after the Image:
   ```tsx
   {insightCount > 0 && (
     <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-[var(--background)] animate-pulse">
       {insightCount > 9 ? "9+" : insightCount}
     </span>
   )}
   ```

**Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/hooks/useInsightCount.ts src/components/ai/AIDrawer.tsx
git commit -m "feat(ai): add notification badge on FAB with insight count polling"
```

---

## Task 9: Insight Queue Component

**Files:**
- Create: `src/components/ai/InsightQueue.tsx`
- Modify: `src/components/ai/ChatWindow.tsx`

**Step 1: Create InsightQueue component**

Create `src/components/ai/InsightQueue.tsx`:

```typescript
"use client";

import { X, Clock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export interface InsightItem {
  id: string;
  emoji: string;
  text: string;
  prompt: string;
  snoozable?: boolean;
}

interface InsightQueueProps {
  insights: InsightItem[];
  onAction: (prompt: string) => void;
  onDismiss: (id: string) => void;
  onSnooze?: (id: string) => void;
}

export default function InsightQueue({ insights, onAction, onDismiss, onSnooze }: InsightQueueProps) {
  if (insights.length === 0) return null;

  return (
    <div className="px-5 pt-3 space-y-2">
      <p
        className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Insights ({insights.length})
      </p>
      <AnimatePresence>
        {insights.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]"
          >
            <span className="text-sm mt-0.5">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[var(--text-primary)] leading-snug" style={{ fontFamily: "var(--font-body)" }}>
                {item.text}
              </p>
              <button
                onClick={() => onAction(item.prompt)}
                className="mt-1 text-[10px] font-semibold text-[#B8A200] hover:text-[#FFE600] transition-colors"
              >
                Tell me more &rarr;
              </button>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.snoozable && onSnooze && (
                <button
                  onClick={() => onSnooze(item.id)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                  title="Snooze 2h"
                >
                  <Clock size={12} />
                </button>
              )}
              <button
                onClick={() => onDismiss(item.id)}
                className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                title="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Integrate into ChatWindow**

In `src/components/ai/ChatWindow.tsx`:

1. Add import: `import InsightQueue, { type InsightItem } from "./InsightQueue";`
2. Add state inside component: `const [insights, setInsights] = useState<InsightItem[]>([]);`
3. Add handlers:
   ```typescript
   const handleInsightDismiss = (id: string) => setInsights((prev) => prev.filter((i) => i.id !== id));
   const handleInsightAction = (prompt: string) => onSend(prompt);
   ```
4. Render between the header `</div>` and `{/* Messages */}` comment:
   ```tsx
   <InsightQueue
     insights={insights}
     onAction={handleInsightAction}
     onDismiss={handleInsightDismiss}
   />
   ```

**Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/components/ai/InsightQueue.tsx src/components/ai/ChatWindow.tsx
git commit -m "feat(ai): add InsightQueue component with dismiss/snooze/action"
```

---

## Task 10: Context Enricher Utility

**Files:**
- Create: `src/lib/ai/context-enricher.ts`
- Test: `src/lib/ai/__tests__/context-enricher.test.ts`

**Step 1: Write the failing test**

Create `src/lib/ai/__tests__/context-enricher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));

const mockMeetingFindById = vi.fn();
const mockDMFind = vi.fn();
const mockTaskFind = vi.fn();

vi.mock("@/lib/infra/db/models/meeting", () => ({ default: { findById: mockMeetingFindById } }));
vi.mock("@/lib/infra/db/models/direct-message", () => ({ default: { find: mockDMFind } }));
vi.mock("@/lib/infra/db/models/task", () => ({ default: { find: mockTaskFind } }));

import { enrichTask, enrichMeeting } from "../context-enricher";

describe("context-enricher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enrichTask returns relatedMessages and sourceMeeting", async () => {
    mockMeetingFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockDMFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await enrichTask({ _id: "task1", title: "Test" });
    expect(result).toHaveProperty("relatedMessages");
    expect(result).toHaveProperty("sourceMeeting");
  });

  it("enrichMeeting returns relatedTasks", async () => {
    mockTaskFind.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await enrichMeeting({ _id: "meet1", title: "Standup" });
    expect(result).toHaveProperty("relatedTasks");
    expect(result.relatedTasks).toEqual([]);
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `npx vitest run src/lib/ai/__tests__/context-enricher.test.ts`

**Step 3: Implement context-enricher.ts**

Create `src/lib/ai/context-enricher.ts`:

```typescript
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("context-enricher");
const MAX_RELATED = 3;

interface EnrichedTaskContext {
  sourceMeeting: { id: string; title: string; scheduledAt?: string } | null;
  relatedMessages: Array<{ content: string; sender: string; createdAt: string }>;
}

interface EnrichedMeetingContext {
  relatedTasks: Array<{ id: string; title: string; status: string }>;
}

export async function enrichTask(
  task: { _id: unknown; title: string; meetingId?: unknown },
): Promise<EnrichedTaskContext> {
  const result: EnrichedTaskContext = { sourceMeeting: null, relatedMessages: [] };

  try {
    const [Meeting, DirectMessage] = await Promise.all([
      import("@/lib/infra/db/models/meeting").then((m) => m.default),
      import("@/lib/infra/db/models/direct-message").then((m) => m.default),
    ]);

    if (task.meetingId) {
      const meeting = await Meeting.findById(task.meetingId).lean();
      if (meeting) {
        result.sourceMeeting = {
          id: meeting._id.toString(),
          title: meeting.title,
          scheduledAt: meeting.scheduledAt?.toISOString(),
        };
      }
    }

    const escapedTitle = task.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const messages = await DirectMessage.find({
      content: { $regex: escapedTitle, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_RELATED)
      .lean();

    result.relatedMessages = messages.map((m: Record<string, unknown>) => ({
      content: String(m.content ?? "").slice(0, 200),
      sender: String(m.senderId ?? "unknown"),
      createdAt: (m.createdAt as Date)?.toISOString?.() ?? "",
    }));
  } catch (err) {
    log.warn({ err, taskId: task._id }, "Task enrichment failed (non-fatal)");
  }

  return result;
}

export async function enrichMeeting(
  meeting: { _id: unknown; title: string },
): Promise<EnrichedMeetingContext> {
  const result: EnrichedMeetingContext = { relatedTasks: [] };

  try {
    const Task = (await import("@/lib/infra/db/models/task")).default;

    const tasks = await Task.find({ meetingId: meeting._id })
      .limit(MAX_RELATED)
      .lean();

    result.relatedTasks = tasks.map((t: Record<string, unknown>) => ({
      id: String(t._id),
      title: String(t.title),
      status: t.completedAt ? "done" : "open",
    }));
  } catch (err) {
    log.warn({ err, meetingId: meeting._id }, "Meeting enrichment failed (non-fatal)");
  }

  return result;
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add src/lib/ai/context-enricher.ts src/lib/ai/__tests__/context-enricher.test.ts
git commit -m "feat(ai): add context-enricher for cross-entity linking (1-hop, max 3)"
```

---

## Task 11: Add remember_this and recall_memory Tools

**Files:**
- Modify: `src/lib/ai/tools.ts` (add function declarations + executor cases)

**Step 1: Add Gemini function declarations**

In `src/lib/ai/tools.ts`, add to the `WORKSPACE_TOOLS` function declarations array:

```typescript
{
  name: "remember_this",
  description: "Store an explicit memory the user asked you to remember. Use when user says 'remember that...' or 'note that...'",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      content: { type: SchemaType.STRING, description: "The fact or preference to remember" },
      category: {
        type: SchemaType.STRING,
        enum: ["preference", "context", "task", "relationship", "habit", "project", "workflow"],
        description: "Category of memory",
      },
    },
    required: ["content", "category"],
  },
},
{
  name: "recall_memory",
  description: "Search the user's stored memories by topic. Use when user asks 'what do you remember about...' or when you need context about a project or preference.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: "Search query to find relevant memories" },
      category: {
        type: SchemaType.STRING,
        enum: ["preference", "context", "task", "relationship", "habit", "project", "workflow"],
        description: "Optional category filter",
      },
    },
    required: ["query"],
  },
},
```

**Step 2: Add executor cases in the tool executor switch/if-else chain**

```typescript
case "remember_this": {
  const AIMemory = (await import("@/lib/infra/db/models/ai-memory")).default;
  const content = args.content as string;
  const category = args.category as string;

  if (!content || content.length > 2000) {
    return { success: false, error: "Content required, max 2000 chars" };
  }

  // Capacity: 100 per user
  const count = await AIMemory.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
  if (count >= 100) {
    const toEvict = await AIMemory.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      userExplicit: { $ne: true },
    })
      .sort({ confidence: 1, updatedAt: 1 })
      .lean();
    if (toEvict) await AIMemory.deleteOne({ _id: toEvict._id });
  }

  const DECAY_RATES: Record<string, number> = {
    project: 0.2, workflow: 0.2, preference: 0.3,
    relationship: 0.3, habit: 0.4, context: 0.5, task: 0.6,
  };

  await AIMemory.create({
    userId: new mongoose.Types.ObjectId(userId),
    category,
    content,
    source: "explicit",
    confidence: 0.9,
    decayRate: DECAY_RATES[category] ?? 0.5,
    userExplicit: true,
  });

  return { success: true, message: `Remembered: "${content.slice(0, 100)}..."` };
}

case "recall_memory": {
  const AIMemory = (await import("@/lib/infra/db/models/ai-memory")).default;
  const query = args.query as string;
  const category = args.category as string | undefined;

  const filter: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  };
  if (category) filter.category = category;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const memories = await AIMemory.find({
    ...filter,
    content: { $regex: escapedQuery, $options: "i" },
  })
    .sort({ confidence: -1 })
    .limit(10)
    .lean();

  if (memories.length === 0) {
    return { success: true, memories: [], message: "No memories found matching that query." };
  }

  return {
    success: true,
    memories: memories.map((m) => ({
      id: m._id.toString(),
      category: m.category,
      content: m.content,
      confidence: m.confidence,
      userExplicit: m.userExplicit ?? false,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(ai): add remember_this and recall_memory Gemini tool declarations + executors"
```

---

## Task 12: Upgrade loadUserMemories with Priority Ordering

**Files:**
- Modify: `src/lib/chat/agent-processor.ts`

**Step 1: Enhance loadUserMemories**

In `src/lib/chat/agent-processor.ts`, update `loadUserMemories` (around line 466):

```typescript
async function loadUserMemories(userId: string): Promise<string> {
  try {
    const memories = await AIMemory.find({
      userId: new mongoose.Types.ObjectId(userId),
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ confidence: -1, updatedAt: -1 })
      .limit(30)
      .lean();

    if (memories.length === 0) return "";

    const categoryOrder = ["project", "workflow", "preference", "relationship", "habit", "context", "task"];
    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      const cat = m.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m.content);
    }

    const parts: string[] = [];
    for (const cat of categoryOrder) {
      if (grouped[cat]) {
        parts.push(`${cat}: ${grouped[cat].join("; ")}`);
      }
    }
    return parts.join("\n");
  } catch (error) {
    log.warn({ error, userId }, "Failed to load user memories (non-fatal)");
    return "";
  }
}
```

**Step 2: Verify build + existing tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/chat/__tests__/agent-processor.test.ts`

**Step 3: Commit**

```bash
git add src/lib/chat/agent-processor.ts
git commit -m "feat(ai): upgrade loadUserMemories with priority ordering and increased limit"
```

---

## Task 13: Session Persistence Upgrade

**Files:**
- Modify: `src/hooks/useAIChat.ts`

**Step 1: Add session types and storage logic**

In `src/hooks/useAIChat.ts`, add after the existing imports and interfaces:

```typescript
const SESSIONS_KEY = "ai-chat-sessions";
const MAX_SESSIONS = 3;

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  label?: string;
  createdAt: number;
}
```

Add state inside the hook:
```typescript
const [sessions, setSessions] = useState<ChatSession[]>(() => {
  if (typeof window === "undefined") return [];
  try {
    const stored = sessionStorage.getItem(SESSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
});
const [activeSessionId, setActiveSessionId] = useState<string>(() => crypto.randomUUID());
```

Save sessions when clearing:
```typescript
const clearMessages = useCallback(() => {
  if (messages.length > 0) {
    setSessions((prev) => {
      const newSession: ChatSession = {
        id: activeSessionId,
        messages,
        createdAt: messages[0]?.timestamp ?? Date.now(),
      };
      const updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
      try { sessionStorage.setItem(SESSIONS_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }
  setMessages([]);
  setActiveSessionId(crypto.randomUUID());
}, [messages, activeSessionId]);
```

Add session switcher:
```typescript
const switchSession = useCallback((sessionId: string) => {
  const session = sessions.find((s) => s.id === sessionId);
  if (session) {
    setMessages(session.messages);
    setActiveSessionId(session.id);
  }
}, [sessions]);
```

Return `sessions`, `activeSessionId`, `switchSession` from the hook.

**Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/hooks/useAIChat.ts
git commit -m "feat(ai): add session persistence with 3-session history and switcher"
```

---

## Task 14: Session Switcher UI

**Files:**
- Create: `src/components/ai/SessionSwitcher.tsx`
- Modify: `src/components/ai/ChatWindow.tsx`
- Modify: `src/components/ai/AIDrawer.tsx`

**Step 1: Create SessionSwitcher component**

Create `src/components/ai/SessionSwitcher.tsx`:

```typescript
"use client";

interface Session {
  id: string;
  label?: string;
  createdAt: number;
}

interface SessionSwitcherProps {
  sessions: Session[];
  activeSessionId?: string;
  onSwitch: (id: string) => void;
}

export default function SessionSwitcher({ sessions, activeSessionId, onSwitch }: SessionSwitcherProps) {
  if (sessions.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-5 py-1.5 border-b border-[var(--border)] overflow-x-auto">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const label = session.label || formatDate(session.createdAt);
        return (
          <button
            key={session.id}
            onClick={() => onSwitch(session.id)}
            className={`shrink-0 px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
              isActive
                ? "bg-[#FFE600]/20 text-[#B8A200] border border-[#FFE600]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

**Step 2: Wire into ChatWindow and AIDrawer**

In `ChatWindow.tsx`:
1. Add `sessions`, `activeSessionId`, `onSwitchSession` to `ChatWindowProps`
2. Add import: `import SessionSwitcher from "./SessionSwitcher";`
3. Render `<SessionSwitcher>` between header and messages

In `AIDrawer.tsx`:
1. Pass `sessions`, `activeSessionId`, `switchSession` from `useAIChat` through to `ChatWindow`

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/components/ai/SessionSwitcher.tsx src/components/ai/ChatWindow.tsx src/components/ai/AIDrawer.tsx
git commit -m "feat(ai): add session switcher tabs for chat history navigation"
```

---

## Task 15: Full Build + Test Verification

**Step 1: Run full type check**

Run: `npx tsc --noEmit --pretty`

**Step 2: Run all tests**

Run: `npx vitest run`

**Step 3: Run production build**

Run: `npm run build`

**Step 4: Fix any errors found**

**Step 5: Final commit if fixes needed**

```bash
git add -A && git commit -m "fix(ai): phase 2 build fixes"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Upgrade AIMemory schema | `ai-memory.ts` |
| 2 | New proactive types + cap | `proactive-limiter.ts` |
| 3 | Stale task nudge trigger | `proactive-triggers.ts` |
| 4 | Weekly pattern summary trigger | `proactive-triggers.ts` |
| 5 | Unread highlights trigger | `proactive-triggers.ts` |
| 6 | Wire new triggers into cron | `cron/proactive/route.ts` |
| 7 | Insight count API + Redis | `proactive-insights.ts`, API route |
| 8 | FAB notification badge | `AIDrawer.tsx`, `useInsightCount.ts` |
| 9 | Insight queue component | `InsightQueue.tsx`, `ChatWindow.tsx` |
| 10 | Context enricher | `context-enricher.ts` |
| 11 | remember/recall tools | `tools.ts` |
| 12 | Upgrade loadUserMemories | `agent-processor.ts` |
| 13 | Session persistence | `useAIChat.ts` |
| 14 | Session switcher UI | `SessionSwitcher.tsx` |
| 15 | Full verification | All files |

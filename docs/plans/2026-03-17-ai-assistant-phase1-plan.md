# AI Assistant Enhancement — Phase 1: Structured Cards + Quick Actions

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the AI drawer from plain-text chatbot into a card-based intelligent interface with context-aware suggestion chips and a smart empty state.

**Architecture:** Add a card rendering layer between the SSE stream parser and ChatBubble. Extend the `ChatMessage` type with optional structured `cards` data. Create new card components in `src/components/ai/cards/`. Add suggestion chips and smart empty state to ChatWindow. All changes are frontend-only — no new API endpoints.

**Tech Stack:** React, TypeScript, Tailwind CSS, Framer Motion, Next.js (usePathname), Vitest

---

## Task 1: Define Card Data Types

**Files:**
- Create: `src/components/ai/cards/types.ts`

**Step 1: Create the card type definitions**

```typescript
// src/components/ai/cards/types.ts

export type CardType =
  | "task"
  | "task_list"
  | "meeting"
  | "person"
  | "data_summary"
  | "draft"
  | "workflow_progress"
  | "diff_preview"
  | "batch_action";

export interface BaseCard {
  type: CardType;
}

export interface TaskCardData extends BaseCard {
  type: "task";
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  assignee?: { id: string; name: string; avatar?: string };
  boardId?: string;
}

export interface TaskListCardData extends BaseCard {
  type: "task_list";
  title?: string;
  tasks: TaskCardData[];
}

export interface MeetingCardData extends BaseCard {
  type: "meeting";
  id: string;
  title: string;
  scheduledAt?: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  participants?: Array<{ id: string; name: string; avatar?: string }>;
  joinUrl?: string;
}

export interface PersonCardData extends BaseCard {
  type: "person";
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
  status?: string;
}

export interface DataSummaryCardData extends BaseCard {
  type: "data_summary";
  title: string;
  stats: Array<{ label: string; value: number | string; color?: string }>;
}

export interface DraftCardData extends BaseCard {
  type: "draft";
  draftId: string;
  content: string;
  recipient?: string;
  recipientType?: "conversation" | "email";
  actionType: string; // e.g. "send_message", "send_email"
  actionArgs: Record<string, unknown>;
}

export interface WorkflowProgressCardData extends BaseCard {
  type: "workflow_progress";
  workflowId: string;
  title: string;
  steps: Array<{
    label: string;
    status: "pending" | "in_progress" | "done" | "skipped" | "error";
  }>;
}

export interface DiffPreviewCardData extends BaseCard {
  type: "diff_preview";
  actionType: string;
  actionArgs: Record<string, unknown>;
  actionSummary: string;
  fields: Array<{ label: string; value: string }>;
}

export type CardData =
  | TaskCardData
  | TaskListCardData
  | MeetingCardData
  | PersonCardData
  | DataSummaryCardData
  | DraftCardData
  | WorkflowProgressCardData
  | DiffPreviewCardData;
```

**Step 2: Run build to verify types compile**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new types file

**Step 3: Commit**

```bash
git add src/components/ai/cards/types.ts
git commit -m "feat(ai): add card data type definitions for structured AI responses"
```

---

## Task 2: Extend ChatMessage to Support Cards

**Files:**
- Modify: `src/hooks/useAIChat.ts:6-27` (ChatMessage interface)
- Modify: `src/hooks/useAIChat.ts:196-236` (tool_result SSE handler)

**Step 1: Add cards field to ChatMessage**

In `src/hooks/useAIChat.ts`, add the import and extend the interface.

At the top of the file (after line 4), add:
```typescript
import type { CardData } from "@/components/ai/cards/types";
```

Extend `ChatMessage` (line 21-27) to:
```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  cards?: CardData[];
}
```

**Step 2: Parse card data from tool_result SSE events**

In the `tool_result` handler (around line 196-236), after the existing `toolCalls` update logic and before `setMessages`, add card extraction logic.

Find the block that starts with `} else if (parsed.type === "tool_result") {` (line 196).

After the existing `toolCalls = toolCalls.map(...)` block (after line 229), add:

```typescript
                // Extract card data from tool results
                const resultData = parsed.data as Record<string, unknown> | undefined;
                if (resultData?.cards) {
                  const newCards = resultData.cards as CardData[];
                  cards = [...cards, ...newCards];
                }
```

Initialize `cards` alongside the existing `toolCalls` variable (around line 138):
```typescript
        let cards: CardData[] = [];
```

Update ALL `setMessages` calls inside the streaming handler to include `cards`:
- Every place that does `{ ...m, content: accumulated, toolCalls: [...toolCalls] }` should become `{ ...m, content: accumulated, toolCalls: [...toolCalls], cards: [...cards] }`

There are 5 instances of this pattern in the file (lines ~173-178, ~189-195, ~230-236, ~260-266). Update all of them.

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/hooks/useAIChat.ts
git commit -m "feat(ai): extend ChatMessage with cards field and parse from SSE stream"
```

---

## Task 3: Build TaskCard Component

**Files:**
- Create: `src/components/ai/cards/TaskCard.tsx`

**Step 1: Create the TaskCard component**

```typescript
"use client";

import { CheckSquare, Calendar, AlertCircle, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import type { TaskCardData } from "./types";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const STATUS_ICONS: Record<string, string> = {
  done: "text-green-500",
  "in-progress": "text-blue-500",
  "in-review": "text-purple-500",
  todo: "text-[var(--text-muted)]",
  blocked: "text-red-500",
};

interface TaskCardProps {
  data: TaskCardData;
  onToggle?: (taskId: string) => void;
  compact?: boolean;
}

export default function TaskCard({ data, onToggle, compact }: TaskCardProps) {
  const isDone = data.status === "done";
  const priorityClass = data.priority ? PRIORITY_COLORS[data.priority] || "" : "";
  const statusClass = STATUS_ICONS[data.status] || "text-[var(--text-muted)]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2.5 ${
        compact ? "py-1.5" : ""
      }`}
    >
      <button
        onClick={() => onToggle?.(data.id)}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          isDone
            ? "bg-green-500 border-green-600 text-white"
            : "border-[var(--border-strong)] hover:border-[#FFE600]"
        }`}
      >
        {isDone && <CheckSquare size={12} />}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-medium leading-snug ${
            isDone ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
          }`}
          style={{ fontFamily: "var(--font-body)" }}
        >
          {data.title}
        </p>

        {!compact && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {data.priority && (
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${priorityClass}`}>
                {data.priority}
              </span>
            )}
            {data.dueDate && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Calendar size={9} />
                {new Date(data.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {data.assignee && (
              <span className="text-[10px] text-[var(--text-secondary)]">
                {data.assignee.name}
              </span>
            )}
            {data.status && data.status !== "done" && (
              <span className={`flex items-center gap-0.5 text-[10px] capitalize ${statusClass}`}>
                <AlertCircle size={9} />
                {data.status.replace("-", " ")}
              </span>
            )}
          </div>
        )}
      </div>

      {data.boardId && (
        <button
          className="mt-0.5 shrink-0 text-[var(--text-muted)] hover:text-[#FFE600] transition-colors"
          title="Open in board"
        >
          <ArrowUpRight size={12} />
        </button>
      )}
    </motion.div>
  );
}
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ai/cards/TaskCard.tsx
git commit -m "feat(ai): add TaskCard component for structured task rendering"
```

---

## Task 4: Build MeetingCard, PersonCard, DataSummaryCard

**Files:**
- Create: `src/components/ai/cards/MeetingCard.tsx`
- Create: `src/components/ai/cards/PersonCard.tsx`
- Create: `src/components/ai/cards/DataSummaryCard.tsx`

**Step 1: Create MeetingCard**

```typescript
"use client";

import { Calendar, Users, Video, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { MeetingCardData } from "./types";

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  scheduled: { label: "Upcoming", class: "bg-blue-500/20 text-blue-400" },
  live: { label: "Live Now", class: "bg-green-500/20 text-green-400" },
  ended: { label: "Ended", class: "bg-[var(--surface-hover)] text-[var(--text-muted)]" },
  cancelled: { label: "Cancelled", class: "bg-red-500/20 text-red-400" },
};

export default function MeetingCard({ data }: { data: MeetingCardData }) {
  const badge = STATUS_BADGE[data.status] || STATUS_BADGE.scheduled;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFE600]/20 border border-[#FFE600]/40">
            <Calendar size={14} className="text-[#B8A200]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              {data.title}
            </p>
            {data.scheduledAt && (
              <p className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mt-0.5">
                <Clock size={9} />
                {new Date(data.scheduledAt).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${badge.class}`}>
          {badge.label}
        </span>
      </div>

      {data.participants && data.participants.length > 0 && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-[var(--text-secondary)]">
          <Users size={10} />
          {data.participants.slice(0, 3).map((p) => p.name).join(", ")}
          {data.participants.length > 3 && ` +${data.participants.length - 3}`}
        </div>
      )}

      {data.status === "live" && data.joinUrl && (
        <button className="mt-2 flex items-center gap-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold py-1.5 px-3 border-2 border-green-600 shadow-[2px_2px_0_#166534] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all w-full justify-center">
          <Video size={12} /> Join Meeting
        </button>
      )}
    </motion.div>
  );
}
```

**Step 2: Create PersonCard**

```typescript
"use client";

import { User, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import type { PersonCardData } from "./types";

export default function PersonCard({ data }: { data: PersonCardData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-2.5"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] border-2 border-[var(--border-strong)]">
        {data.avatar ? (
          <img src={data.avatar} alt={data.name} className="h-full w-full rounded-full object-cover" />
        ) : (
          <User size={14} className="text-[var(--text-muted)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--text-primary)] truncate" style={{ fontFamily: "var(--font-heading)" }}>
          {data.name}
        </p>
        {data.role && (
          <p className="text-[10px] text-[var(--text-muted)] truncate">{data.role}</p>
        )}
      </div>
      <button
        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[#FFE600] transition-colors"
        title="Message"
      >
        <MessageSquare size={13} />
      </button>
    </motion.div>
  );
}
```

**Step 3: Create DataSummaryCard**

```typescript
"use client";

import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import type { DataSummaryCardData } from "./types";

const COLOR_MAP: Record<string, string> = {
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  default: "bg-[#FFE600]",
};

export default function DataSummaryCard({ data }: { data: DataSummaryCardData }) {
  const maxValue = Math.max(...data.stats.filter((s) => typeof s.value === "number").map((s) => s.value as number), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <BarChart3 size={13} className="text-[#FFE600]" />
        <p className="text-xs font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {data.title}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">{stat.label}</span>
              <span className="text-xs font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                {stat.value}
              </span>
            </div>
            {typeof stat.value === "number" && (
              <div className="h-1 rounded-full bg-[var(--surface-hover)]">
                <div
                  className={`h-full rounded-full transition-all ${COLOR_MAP[stat.color || "default"]}`}
                  style={{ width: `${Math.min((stat.value / maxValue) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
```

**Step 4: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/ai/cards/MeetingCard.tsx src/components/ai/cards/PersonCard.tsx src/components/ai/cards/DataSummaryCard.tsx
git commit -m "feat(ai): add MeetingCard, PersonCard, DataSummaryCard components"
```

---

## Task 5: Build DraftCard and DiffPreviewCard

**Files:**
- Create: `src/components/ai/cards/DraftCard.tsx`
- Create: `src/components/ai/cards/DiffPreviewCard.tsx`

**Step 1: Create DraftCard**

```typescript
"use client";

import { useState } from "react";
import { Send, Sparkles, Copy, X } from "lucide-react";
import { motion } from "framer-motion";
import type { DraftCardData } from "./types";

interface DraftCardProps {
  data: DraftCardData;
  onSend?: (actionType: string, args: Record<string, unknown>) => void;
  onPolish?: (content: string) => void;
}

export default function DraftCard({ data, onSend, onPolish }: DraftCardProps) {
  const [content, setContent] = useState(data.content);
  const [status, setStatus] = useState<"editing" | "sending" | "sent" | "discarded">("editing");

  const handleSend = () => {
    setStatus("sending");
    const args = { ...data.actionArgs, content };
    onSend?.(data.actionType, args);
    setStatus("sent");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  if (status === "sent") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3.5 py-2.5 text-[11px] text-green-500 font-semibold">
        <Send size={12} /> Sent
      </motion.div>
    );
  }

  if (status === "discarded") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      {data.recipient && (
        <p className="text-[10px] text-[var(--text-muted)] mb-2">
          To: <span className="font-medium text-[var(--text-secondary)]">{data.recipient}</span>
        </p>
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 resize-none focus:border-[#FFE600] focus:outline-none text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-body)" }}
      />

      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={handleSend}
          disabled={status === "sending"}
          className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold py-1.5 px-3 border-2 border-green-600 shadow-[2px_2px_0_#166534] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Send size={11} /> Send
        </button>
        <button
          onClick={() => onPolish?.(content)}
          className="flex items-center gap-1.5 rounded-lg bg-[#FFE600]/20 text-[#B8A200] text-[11px] font-bold py-1.5 px-3 border border-[#FFE600]/40 hover:bg-[#FFE600]/30 transition-colors"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Sparkles size={11} /> Polish
        </button>
        <button onClick={handleCopy} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Copy">
          <Copy size={13} />
        </button>
        <button onClick={() => setStatus("discarded")} className="ml-auto p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors" title="Discard">
          <X size={13} />
        </button>
      </div>
    </motion.div>
  );
}
```

**Step 2: Create DiffPreviewCard**

```typescript
"use client";

import { useState } from "react";
import { Check, X, Eye } from "lucide-react";
import { motion } from "framer-motion";
import type { DiffPreviewCardData } from "./types";

interface DiffPreviewCardProps {
  data: DiffPreviewCardData;
  onConfirm?: (actionType: string, args: Record<string, unknown>) => void;
  onDeny?: () => void;
}

export default function DiffPreviewCard({ data, onConfirm, onDeny }: DiffPreviewCardProps) {
  const [status, setStatus] = useState<"preview" | "confirming" | "confirmed" | "denied">("preview");

  const handleConfirm = async () => {
    setStatus("confirming");
    await onConfirm?.(data.actionType, data.actionArgs);
    setStatus("confirmed");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Eye size={13} className="text-[#FFE600]" />
        <p className="text-xs font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {data.actionSummary}
        </p>
      </div>

      <div className="space-y-1.5 mb-3">
        {data.fields.map((field) => (
          <div key={field.label} className="flex gap-2 text-[10px]">
            <span className="text-[var(--text-muted)] shrink-0 w-20">{field.label}:</span>
            <span className="text-[var(--text-primary)] font-medium">{field.value}</span>
          </div>
        ))}
      </div>

      {status === "preview" && (
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold py-1.5 px-3 border-2 border-green-600 shadow-[2px_2px_0_#166534] hover:shadow-[1px_1px_0_#166534] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Check size={12} /> Confirm
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { setStatus("denied"); onDeny?.(); }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] text-[11px] font-bold py-1.5 px-3 border-2 border-[var(--border-default)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <X size={12} /> Cancel
          </motion.button>
        </div>
      )}

      {status === "confirming" && (
        <p className="text-[11px] text-[var(--text-muted)]">Executing...</p>
      )}
      {status === "confirmed" && (
        <p className="text-[11px] text-green-500 font-semibold flex items-center gap-1"><Check size={12} /> Done</p>
      )}
      {status === "denied" && (
        <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><X size={12} /> Cancelled</p>
      )}
    </motion.div>
  );
}
```

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/ai/cards/DraftCard.tsx src/components/ai/cards/DiffPreviewCard.tsx
git commit -m "feat(ai): add DraftCard and DiffPreviewCard components"
```

---

## Task 6: Build CardRenderer and Wire into ChatBubble

**Files:**
- Create: `src/components/ai/cards/CardRenderer.tsx`
- Create: `src/components/ai/cards/index.ts`
- Modify: `src/components/ai/ChatBubble.tsx:239-357` (main render function)

**Step 1: Create CardRenderer**

```typescript
"use client";

import type { CardData } from "./types";
import TaskCard from "./TaskCard";
import MeetingCard from "./MeetingCard";
import PersonCard from "./PersonCard";
import DataSummaryCard from "./DataSummaryCard";
import DraftCard from "./DraftCard";
import DiffPreviewCard from "./DiffPreviewCard";

interface CardRendererProps {
  cards: CardData[];
  onAction?: (actionType: string, args: Record<string, unknown>) => void;
}

export default function CardRenderer({ cards, onAction }: CardRendererProps) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-1.5">
      {cards.map((card, i) => {
        const key = `card-${i}-${card.type}`;
        switch (card.type) {
          case "task":
            return <TaskCard key={key} data={card} />;
          case "task_list":
            return (
              <div key={key} className="flex flex-col gap-1.5">
                {card.title && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] px-1" style={{ fontFamily: "var(--font-heading)" }}>
                    {card.title}
                  </p>
                )}
                {card.tasks.map((t, j) => (
                  <TaskCard key={`${key}-task-${j}`} data={t} compact />
                ))}
              </div>
            );
          case "meeting":
            return <MeetingCard key={key} data={card} />;
          case "person":
            return <PersonCard key={key} data={card} />;
          case "data_summary":
            return <DataSummaryCard key={key} data={card} />;
          case "draft":
            return (
              <DraftCard
                key={key}
                data={card}
                onSend={(actionType, args) => onAction?.(actionType, args)}
              />
            );
          case "diff_preview":
            return (
              <DiffPreviewCard
                key={key}
                data={card}
                onConfirm={(actionType, args) => onAction?.(actionType, args)}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
```

**Step 2: Create barrel export**

```typescript
// src/components/ai/cards/index.ts
export { default as CardRenderer } from "./CardRenderer";
export { default as TaskCard } from "./TaskCard";
export { default as MeetingCard } from "./MeetingCard";
export { default as PersonCard } from "./PersonCard";
export { default as DataSummaryCard } from "./DataSummaryCard";
export { default as DraftCard } from "./DraftCard";
export { default as DiffPreviewCard } from "./DiffPreviewCard";
export type * from "./types";
```

**Step 3: Wire CardRenderer into ChatBubble**

In `src/components/ai/ChatBubble.tsx`:

Add import near top (after line 8):
```typescript
import { CardRenderer } from "./cards";
import type { CardData } from "./cards/types";
```

Add `cards` to the ChatBubbleProps interface (line 17-26):
```typescript
interface ChatBubbleProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  cards?: CardData[];
  onConfirmAction?: (actionId: string, actionType: string, args: Record<string, unknown>) => void;
  onDenyAction?: (actionId: string) => void;
}
```

Update the component destructuring (line 239):
```typescript
export default function ChatBubble({ id, role, content, timestamp, isStreaming, toolCalls, cards, onConfirmAction, onDenyAction }: ChatBubbleProps) {
```

Add `const hasCards = cards && cards.length > 0;` after `const isBriefing` (line 245).

Insert card rendering AFTER the pending action cards block (after line 325, before the message bubble div at line 327):
```typescript
        {/* Structured response cards */}
        {isAssistant && hasCards && (
          <CardRenderer cards={cards} />
        )}
```

**Step 4: Wire cards prop through ChatWindow**

In `src/components/ai/ChatWindow.tsx` (line 131-139), add `cards` to the ChatBubble props:
```typescript
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            id={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            isStreaming={isStreaming && msg.role === "assistant" && msg === messages[messages.length - 1]}
            toolCalls={msg.toolCalls}
            cards={msg.cards}
          />
        ))}
```

**Step 5: Run type check and build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/ai/cards/CardRenderer.tsx src/components/ai/cards/index.ts src/components/ai/ChatBubble.tsx src/components/ai/ChatWindow.tsx
git commit -m "feat(ai): wire CardRenderer into ChatBubble for structured responses"
```

---

## Task 7: Build SuggestionChips Component

**Files:**
- Create: `src/components/ai/SuggestionChips.tsx`
- Create: `src/hooks/usePageContext.ts`

**Step 1: Create usePageContext hook**

```typescript
"use client";

import { usePathname } from "next/navigation";

export type PageContext =
  | "dashboard"
  | "meeting"
  | "board"
  | "messages"
  | "settings"
  | "unknown";

interface PageContextResult {
  context: PageContext;
  entityId?: string;
}

export function usePageContext(): PageContextResult {
  const pathname = usePathname();

  if (!pathname) return { context: "unknown" };

  if (pathname === "/dashboard" || pathname === "/") {
    return { context: "dashboard" };
  }

  const meetingMatch = pathname.match(/\/meetings?\/([a-zA-Z0-9]+)/);
  if (meetingMatch) {
    return { context: "meeting", entityId: meetingMatch[1] };
  }

  if (pathname.includes("/board") || pathname.includes("/tasks")) {
    const boardMatch = pathname.match(/\/boards?\/([a-zA-Z0-9]+)/);
    return { context: "board", entityId: boardMatch?.[1] };
  }

  if (pathname.includes("/messages") || pathname.includes("/conversations")) {
    const convMatch = pathname.match(/\/(?:messages|conversations)\/([a-zA-Z0-9]+)/);
    return { context: "messages", entityId: convMatch?.[1] };
  }

  if (pathname.includes("/settings")) {
    return { context: "settings" };
  }

  return { context: "unknown" };
}
```

**Step 2: Create SuggestionChips**

```typescript
"use client";

import { usePageContext, type PageContext } from "@/hooks/usePageContext";

interface ChipConfig {
  label: string;
  prompt: string;
}

const CHIP_MAP: Record<PageContext, ChipConfig[]> = {
  dashboard: [
    { label: "Draft standup", prompt: "Draft my standup update for today" },
    { label: "What's overdue?", prompt: "Show me all my overdue tasks" },
    { label: "Prep for next meeting", prompt: "Prepare me for my next upcoming meeting" },
    { label: "Summarize yesterday", prompt: "Summarize what happened yesterday" },
  ],
  meeting: [
    { label: "Summarize meeting", prompt: "Summarize this meeting" },
    { label: "Create action items", prompt: "Create action items from this meeting" },
    { label: "Draft follow-up", prompt: "Draft a follow-up message for this meeting" },
  ],
  board: [
    { label: "What should I do next?", prompt: "What should I work on next based on my tasks?" },
    { label: "Stale task check", prompt: "Which of my tasks haven't been updated recently?" },
    { label: "Sprint progress", prompt: "Summarize sprint progress for my board" },
  ],
  messages: [
    { label: "Summarize thread", prompt: "Summarize this conversation thread" },
    { label: "Draft a reply", prompt: "Help me draft a reply to this conversation" },
    { label: "Find related tasks", prompt: "Find tasks related to this conversation" },
  ],
  settings: [
    { label: "What can you do?", prompt: "What are all the things you can help me with?" },
  ],
  unknown: [
    { label: "Summarize my day", prompt: "Summarize my day" },
    { label: "What's pending?", prompt: "What tasks are pending for me?" },
  ],
};

// Time-based overrides for Monday mornings
function getMondayChips(): ChipConfig[] {
  const now = new Date();
  if (now.getDay() === 1 && now.getHours() < 12) {
    return [
      { label: "Weekly plan", prompt: "Help me plan my week based on my tasks and meetings" },
      { label: "This week's meetings", prompt: "What meetings do I have this week?" },
    ];
  }
  return [];
}

interface SuggestionChipsProps {
  onSelect: (prompt: string) => void;
  maxChips?: number;
}

export default function SuggestionChips({ onSelect, maxChips = 4 }: SuggestionChipsProps) {
  const { context } = usePageContext();

  const mondayChips = getMondayChips();
  const contextChips = CHIP_MAP[context] || CHIP_MAP.unknown;
  const chips = [...mondayChips, ...contextChips].slice(0, maxChips);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onSelect(chip.prompt)}
          className="shrink-0 text-[10px] font-medium px-2.5 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[#FFE600] hover:bg-[#FFE600]/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 3: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/hooks/usePageContext.ts src/components/ai/SuggestionChips.tsx
git commit -m "feat(ai): add SuggestionChips with context-aware prompts and usePageContext hook"
```

---

## Task 8: Build SmartEmptyState Component

**Files:**
- Create: `src/components/ai/SmartEmptyState.tsx`

**Step 1: Create the SmartEmptyState component**

```typescript
"use client";

import { Sun, Moon, CloudSun } from "lucide-react";
import Image from "next/image";
import SuggestionChips from "./SuggestionChips";
import { useAuth } from "@/hooks/useAuth";

function getGreeting(): { text: string; Icon: React.ElementType } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", Icon: Sun };
  if (hour < 17) return { text: "Good afternoon", Icon: CloudSun };
  return { text: "Good evening", Icon: Moon };
}

const MASCOT_BY_MODE: Record<string, string> = {
  social: "/mascot-social.png",
  lockin: "/mascot-lockin.png",
  invisible: "/mascot-invisible.png",
};

interface SmartEmptyStateProps {
  onSend: (message: string) => void;
  briefingMetadata?: {
    unreadCount?: number;
    nextMeetingTime?: string | null;
    boardOverdueCount?: number | null;
    boardTaskCount?: number | null;
  } | null;
}

export default function SmartEmptyState({ onSend, briefingMetadata }: SmartEmptyStateProps) {
  const { user } = useAuth();
  const mascotSrc = MASCOT_BY_MODE[user?.mode || "social"] || MASCOT_BY_MODE.social;
  const { text: greeting, Icon: GreetingIcon } = getGreeting();
  const firstName = user?.displayName?.split(" ")[0] || user?.name?.split(" ")[0] || "";

  const insights: Array<{ emoji: string; text: string }> = [];
  if (briefingMetadata) {
    if (briefingMetadata.boardOverdueCount && briefingMetadata.boardOverdueCount > 0) {
      insights.push({ emoji: "⚠️", text: `${briefingMetadata.boardOverdueCount} tasks overdue` });
    }
    if (briefingMetadata.nextMeetingTime) {
      const meetingDate = new Date(briefingMetadata.nextMeetingTime);
      const diff = meetingDate.getTime() - Date.now();
      if (diff > 0 && diff < 2 * 60 * 60 * 1000) {
        const mins = Math.round(diff / 60000);
        insights.push({ emoji: "📅", text: `Meeting in ${mins} min` });
      }
    }
    if (briefingMetadata.unreadCount && briefingMetadata.unreadCount > 0) {
      insights.push({ emoji: "💬", text: `${briefingMetadata.unreadCount} unread messages` });
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      {/* Mascot */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] mb-3">
        <Image src={mascotSrc} alt="Yoodle" width={40} height={40} className="mix-blend-multiply" />
      </div>

      {/* Greeting */}
      <div className="flex items-center gap-1.5 mb-1">
        <GreetingIcon size={14} className="text-[#FFE600]" />
        <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </p>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4" style={{ fontFamily: "var(--font-body)" }}>
        How can I help you today?
      </p>

      {/* Insight cards */}
      {insights.length > 0 && (
        <div className="w-full max-w-xs space-y-1.5 mb-4">
          {insights.map((insight) => (
            <button
              key={insight.text}
              onClick={() => onSend(insight.text === insights[0]?.text && insight.emoji === "⚠️" ? "Show me my overdue tasks" : insight.text)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[#FFE600] transition-colors text-left"
            >
              <span className="text-sm">{insight.emoji}</span>
              <span className="text-[11px] text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }}>
                {insight.text}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="w-full max-w-xs">
        <p className="text-[10px] text-[var(--text-muted)] mb-2 text-center" style={{ fontFamily: "var(--font-body)" }}>
          Quick actions
        </p>
        <SuggestionChips onSelect={onSend} />
      </div>
    </div>
  );
}
```

**Step 2: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ai/SmartEmptyState.tsx
git commit -m "feat(ai): add SmartEmptyState with greeting, insights, and quick actions"
```

---

## Task 9: Integrate SuggestionChips and SmartEmptyState into ChatWindow

**Files:**
- Modify: `src/components/ai/ChatWindow.tsx:56-191`

**Step 1: Add imports**

At the top of `ChatWindow.tsx`, add:
```typescript
import SuggestionChips from "./SuggestionChips";
import SmartEmptyState from "./SmartEmptyState";
```

**Step 2: Replace the empty state**

Replace the existing empty state block (lines 101-128):
```typescript
{messages.length === 0 && (
  <div className="flex flex-col items-center justify-center h-full px-4">
    ...existing grid of 4 buttons...
  </div>
)}
```

With:
```typescript
{messages.length === 0 && (
  <SmartEmptyState onSend={onSend} />
)}
```

**Step 3: Add SuggestionChips above the input**

In the input section (around line 145), BEFORE the `<div className="flex items-center gap-2">`, add:
```typescript
        {!isStreaming && messages.length > 0 && (
          <div className="mb-2">
            <SuggestionChips onSelect={onSend} />
          </div>
        )}
```

**Step 4: Run type check and build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/ai/ChatWindow.tsx
git commit -m "feat(ai): integrate SmartEmptyState and SuggestionChips into ChatWindow"
```

---

## Task 10: Full Build Verification

**Step 1: Run type check**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 2: Run build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Run existing tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && npx vitest run 2>&1 | tail -20`
Expected: All tests pass (no regressions)

**Step 4: Fix any issues found, then commit fixes if needed**

---

## Files Summary

| Action | File |
|--------|------|
| Create | `src/components/ai/cards/types.ts` |
| Create | `src/components/ai/cards/TaskCard.tsx` |
| Create | `src/components/ai/cards/MeetingCard.tsx` |
| Create | `src/components/ai/cards/PersonCard.tsx` |
| Create | `src/components/ai/cards/DataSummaryCard.tsx` |
| Create | `src/components/ai/cards/DraftCard.tsx` |
| Create | `src/components/ai/cards/DiffPreviewCard.tsx` |
| Create | `src/components/ai/cards/CardRenderer.tsx` |
| Create | `src/components/ai/cards/index.ts` |
| Create | `src/components/ai/SuggestionChips.tsx` |
| Create | `src/components/ai/SmartEmptyState.tsx` |
| Create | `src/hooks/usePageContext.ts` |
| Modify | `src/hooks/useAIChat.ts` |
| Modify | `src/components/ai/ChatBubble.tsx` |
| Modify | `src/components/ai/ChatWindow.tsx` |

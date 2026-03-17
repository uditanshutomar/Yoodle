# AI Assistant Drawer Enhancement — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Transform the AI assistant drawer from a basic chatbot into an intelligent command center with structured UI cards, proactive intelligence, deep workspace context, and powerful multi-step workflows.

**Architecture:** Enhance the existing FAB + drawer (⌘J) without creating a separate page. All improvements layer onto the current Gemini-powered agent pipeline, SSE streaming, and action proposal system. Frontend-heavy for UI (cards, chips, empty state), backend additions for proactive triggers, workflow engine, and memory upgrades.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Gemini AI (function calling), MongoDB/Mongoose, Redis (rate limiting, notification state), SSE streaming.

**Constraints:**
- Drawer-only — no separate AI page
- Adaptive for both individual contributors and team leads/managers
- Incremental delivery — each section is independently shippable

---

## Section 1: Structured Response Cards

**What exists:** AI responses render as plain markdown in `ChatBubble.tsx`. Action proposals show as basic Accept/Deny cards.

**What we're building:** A card rendering system that detects structured data in AI responses and renders interactive, type-specific cards.

### Card Types

| Card | Renders When | Interactive Elements |
|------|-------------|---------------------|
| **Task Card** | AI returns/creates tasks | Checkbox toggle, assignee avatar, due date, priority badge, "Open in board" link |
| **Task List Card** | Multiple tasks returned | Stacked task cards with "Select all" / bulk actions |
| **Meeting Card** | AI returns meeting info | Time, participants avatars, status badge, "Join" button if live |
| **Person Card** | AI mentions a team member | Avatar, role, status indicator, "Message" quick action |
| **Data Summary Card** | AI returns stats/counts | Mini bar chart or stat grid (e.g., "12 tasks done, 3 overdue, 5 in progress") |
| **Draft Card** | AI drafts a message | Editable text area, recipient preview, "Send" / "Edit more" buttons |
| **Workflow Progress Card** | Multi-step action in flight | Stepper UI (Step 1 done, Step 2 in progress, Step 3 pending) with per-step status |
| **Diff/Preview Card** | Before confirming an action | Shows what will change — field-level diff for edits, full preview for creates |

### How It Works

1. **AI-side:** Gemini already returns structured JSON via function calls. We add a `responseFormat` field to tool responses that hints the card type: `{ type: "task_list", data: [...] }`
2. **Renderer:** New `CardRenderer.tsx` component in `src/components/ai/cards/` that switches on card type and renders the appropriate card component
3. **ChatBubble upgrade:** When a message contains structured card data, `ChatBubble` delegates to `CardRenderer` instead of rendering markdown
4. **Interactivity:** Card actions (toggle checkbox, click "Send") dispatch to existing API endpoints — no new backend for basic interactions

### Upgraded Action Proposal Flow

Current: Plain text description + Accept/Deny buttons.
New: **Diff/Preview Card** showing exactly what the action will do:
- Creating a task → shows the task card with all fields filled in, editable before confirming
- Sending a message → shows the draft card with recipient and content
- Bulk operation → shows a list of affected items with checkboxes to include/exclude

---

## Section 2: Quick Actions & Context-Aware Suggestions

**What exists:** The drawer has a text input and nothing else. Users must know what to ask. Morning briefing is the only proactive content.

**What we're building:** Suggestion chips that adapt to page context, and a smart empty state replacing the blank drawer.

### Suggestion Chips

A row of pill-shaped buttons above the chat input that change based on where the user is and what's happening.

| Context | Chips Shown |
|---------|-------------|
| **Dashboard** | "Draft standup" / "What's overdue?" / "Prep for next meeting" / "Summarize yesterday" |
| **Meeting page (upcoming)** | "Prep for this meeting" / "Summarize last meeting with these people" / "Draft agenda" |
| **Meeting page (ended)** | "Summarize meeting" / "Create action items" / "Draft follow-up message" |
| **Board/Tasks view** | "What should I work on next?" / "Stale task check" / "Summarize sprint progress" |
| **Messages/Conversation** | "Summarize this thread" / "Draft a reply" / "Find related tasks" |
| **Any page, Monday morning** | "Weekly plan" / "Unread highlights" / "This week's meetings" |

**Implementation:**
- New `SuggestionChips.tsx` — renders 3-4 chips max, horizontally scrollable on mobile
- `usePageContext` hook reads `usePathname()` + extracts entity IDs from URL params
- Chip config is a static mapping (context to chips) with time-of-day/day-of-week modifiers
- Clicking a chip inserts the text into the chat input and auto-submits
- No new backend — just pre-composed prompts sent to existing `/api/ai/chat`

### Smart Empty State

When the drawer opens with no active conversation:

- **Greeting** that adapts to time of day (morning/afternoon/evening)
- **Insight cards** — lightweight proactive items from the briefing endpoint, shown as dismissible cards instead of a markdown wall
- **Quick action pills** — larger suggestion chips prominent in the empty state
- **Chat input** at the bottom as always

Replaces the current blank-then-markdown-blob briefing flow. Briefing data is decomposed into individual scannable, actionable cards.

---

## Section 3: Proactive Intelligence

**What exists:** Morning briefing, proactive cron messages (3/day global cap, 1/day per type), limited trigger types.

**What we're building:** 5 new proactive triggers, FAB notification badge, and a queued card display model.

### New Proactive Triggers

| Trigger | Fires When | What It Shows | Frequency Cap |
|---------|-----------|---------------|---------------|
| **Deadline Risk** | Task due within 24h, status not done/in review | Warning with task name and offer to help | 1/day per task |
| **Meeting Prep** | 30 min before a scheduled meeting | Meeting details, related tasks/messages count, offer prep summary | 1 per meeting |
| **Stale Task Nudge** | Task assigned to user, no status change in 5+ days | Task name, days stale, ask if blocked/deprioritized | 1/week per task |
| **Weekly Pattern Summary** | Monday 9 AM | Last week stats, this week outlook | 1/week |
| **Unread Conversation Highlights** | 5+ unread messages, checked every 2 hours | Conversation previews with unread counts | 2/day max |

**Implementation:**
- Trigger functions in `src/lib/chat/proactive-triggers/` — one file per trigger type
- Each trigger queries relevant models, evaluates condition, returns `{ type, title, body, actions, priority }` or null
- Added to existing cron loop in `/api/cron/proactive`
- Existing `proactive-limiter.ts` (atomic Lua script) handles per-type caps
- Global cap raised from 3/day to 5/day

### FAB Notification Badge

- Red dot with count on the floating action button when insights are queued
- Backend: Redis key `proactive:unseen:{userId}` — incremented on fire, cleared on drawer open
- Frontend: polls `/api/ai/insights/count` every 60 seconds, or receives via existing SSE if active
- Gentle pulse animation on first appearance, then static

### Insight Queue Display

Proactive insights appear as **dismissible cards at the top of the drawer**, above the conversation — not dumped into chat history.

- Each card has 1-2 action buttons (trigger a chat prompt or navigate)
- Dismiss removes the card, Snooze pushes back 2 hours
- Stored in `ProactiveInsight` model or lightweight Redis hash — separate from chat messages
- When user clicks an action, card collapses and response flows into normal chat

---

## Section 4: Deeper Context & Memory v2

**What exists:** AIMemory model with 5 categories (preference, context, task, relationship, habit), confidence scoring, TTL. Agent pipeline gathers context per request but each tool fetches entities in isolation.

### Cross-Entity Context Linking

Enrich tool responses with related entity references:

| When AI fetches... | Also include... |
|---|---|
| A **task** | Meeting it was created from, recent messages mentioning it, assigned person's recent activity |
| A **meeting** | Tasks created from it, follow-up messages, attendance status |
| A **conversation thread** | Tasks referenced, meetings mentioned, people involved |
| **Person info** | Their recent tasks, shared meetings, last message exchange |

**Implementation:**
- New `context-enricher.ts` utility — given an entity, performs 1-2 lightweight lookups for related entities
- Called inside existing tool executor functions in `tools.ts` — enriches after primary query
- **Depth limit: 1 hop only** (task to meeting is fine, task to meeting to other tasks is NOT)
- **Capped at 3 related items per type** to keep token usage reasonable

### Memory v2

**New categories:**

| Category | What It Stores | Example |
|---|---|---|
| `project` | Long-term project context, goals, timelines | "Launch planned for March 28, 3 phases" |
| `workflow` | User's recurring processes | "Standup at 9:30 AM, PRs before lunch, deep work afternoons" |

**New features:**
- **Confidence decay adjustment** — `decayRate` field per category. Projects get 0.2 (slow), habits get 0.5 (default)
- **Explicit "remember this"** — user command creates high-confidence (0.9) memory with slow decay
- **"What do you remember?"** — AI searches memory by topic and presents results for user correction
- **Capacity management** — 100 memories per user cap, lowest-confidence evicted first

**Schema additions to `ai-memory.ts`:**
- `category` enum adds: `"project"` | `"workflow"`
- New fields: `decayRate` (number, 0-1), `userExplicit` (boolean, exempt from auto-eviction)

**New tools:** `remember_this`, `recall_memory`

### Session Persistence

- **Last 3 sessions** stored in `sessionStorage` (upgrade existing `useAIChat.ts`)
- **Session switcher** — tabs at top of chat: "Current / Yesterday / Mar 15"
- **Session summary** — auto-generated 1-line label for sessions older than 4 hours
- **Browser-local only** — no backend chat history storage

### Context Pipeline Enhancement

GATHER stage in agent processor gets two automatic injections:
1. **Auto-recall** — fetch top 5 relevant memories before first LLM call (keyword match)
2. **Enrichment** — run context-enricher on each tool call result

---

## Section 5: Multi-Step Actions & Workflows

**What exists:** Single-action proposals with Accept/Deny. 30+ whitelisted atomic actions. No chaining or bulk operations.

### Multi-Step Workflows

Predefined workflow templates:

| Workflow | Trigger Phrase | Steps |
|---|---|---|
| **Meeting Prep** | "Prep for [meeting]" | Fetch meeting, fetch related messages, generate talking points, create prep task |
| **Meeting Follow-up** | "Follow up on [meeting]" | Summarize, extract action items, create tasks, draft follow-up |
| **Sprint Wrap-up** | "Summarize this sprint" | Gather completed tasks, gather open tasks, compute stats, generate summary |
| **Handoff Package** | "Create handoff for [project]" | Gather memories, gather tasks, gather decisions, generate handoff doc |
| **Daily Close-out** | "Wrap up my day" | Log completed, flag stale, prep tomorrow, update standup draft |

**Implementation:**
- Workflow templates in `src/lib/ai/workflows/`
- `workflow-executor.ts` — executes steps sequentially, streams progress via SSE
- Each step reuses existing tools from `tools.ts`
- User can pause, skip a step, or cancel via the Workflow Progress Card
- AI can also compose ad-hoc workflows — proposes a multi-step plan, user clicks "Start"

### Batch Operations

Batch action cards with preview and selection:
- New `batch_action` tool declaration for Gemini
- `BatchActionCard.tsx` — selectable item list + action preview
- `/api/ai/action/batch-confirm` endpoint — receives array of item IDs + action, loops existing handlers
- Partial success supported (per-item error handling)

### Draft & Polish Flow

Inline editable draft cards:
- Editable textarea with recipient preview
- "Send" dispatches via existing message action
- "Polish more" sends draft back to AI for refinement
- "Copy" copies to clipboard
- Works for messages, standups, summaries, follow-ups

### Scheduled Actions

User-created triggers that fire proactive messages at specified times:
- `ScheduledAction` model: `userId, triggerAt, action, status ("pending"|"fired"|"cancelled"), createdAt`
- `schedule_action` tool — AI creates scheduled entries
- Cron job picks up due actions, fires as proactive insight cards
- Cap: 10 active scheduled actions per user
- Simple date parsing: "Thursday" = next Thursday, "in 2 hours" = now + 2h

---

## Phasing Recommendation

| Phase | Sections | Why First |
|-------|----------|-----------|
| **Phase 1** ✅ | Section 1 (Cards) + Section 2 (Quick Actions) | Instant visible UX upgrade, frontend-only, no backend risk |
| **Phase 2** | Section 3 (Proactive) + Section 4 (Context/Memory) | Intelligence foundation that makes everything else smarter |
| **Phase 3** | Section 5 (Workflows/Batch/Scheduled) | Power features that build on Phases 1-2 |

---

## Key Files

| Area | Existing Files | New Files |
|------|---------------|-----------|
| **Cards** | `src/components/ai/ChatBubble.tsx` | `src/components/ai/cards/CardRenderer.tsx`, `TaskCard.tsx`, `MeetingCard.tsx`, `PersonCard.tsx`, `DataSummaryCard.tsx`, `DraftCard.tsx`, `WorkflowProgressCard.tsx`, `DiffPreviewCard.tsx`, `BatchActionCard.tsx` |
| **Quick Actions** | `src/components/ai/ChatWindow.tsx`, `src/hooks/useAIChat.ts` | `src/components/ai/SuggestionChips.tsx`, `src/components/ai/SmartEmptyState.tsx`, `src/hooks/usePageContext.ts` |
| **Proactive** | `src/lib/chat/proactive-limiter.ts`, `src/app/api/cron/proactive/route.ts` | `src/lib/chat/proactive-triggers/deadline-risk.ts`, `meeting-prep.ts`, `stale-task.ts`, `weekly-summary.ts`, `unread-highlights.ts`, `src/lib/infra/db/models/proactive-insight.ts`, `src/app/api/ai/insights/count/route.ts` |
| **Context** | `src/lib/ai/tools.ts`, `src/lib/chat/agent-processor.ts` | `src/lib/ai/context-enricher.ts` |
| **Memory** | `src/lib/infra/db/models/ai-memory.ts` | (schema changes only) |
| **Workflows** | `src/app/api/ai/action/confirm/route.ts` | `src/lib/ai/workflows/workflow-executor.ts`, `src/lib/ai/workflows/templates/`, `src/lib/infra/db/models/scheduled-action.ts`, `src/app/api/ai/action/batch-confirm/route.ts` |

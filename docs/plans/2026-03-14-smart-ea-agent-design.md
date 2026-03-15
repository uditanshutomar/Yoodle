# Smart EA Agent — Design Doc

**Date**: 2026-03-14
**Goal**: Transform Doodle from a reactive chatbot into a proactive executive assistant that keeps busy users updated and takes action with minimal input.

---

## Core Principle

Doodle behaves like a CEO's executive assistant. It doesn't wait to be asked. It walks in, delivers what matters, and asks only decision-requiring questions. No fluff, no "Hey! How's it going?" — just sharp, concise updates and smart action.

---

## Feature 1: Proactive Briefing Engine

### What it does
On login and every 15 minutes, Doodle auto-generates a briefing from the user's Google Workspace data. It appears as the first message in chat (on login) or as an update notification (on refresh).

### Briefing format
```
3 unread — 1 urgent
- Sarah Chen re: Q2 budget approval — needs sign-off by EOD
- 2 FYI (marketing recap, HR newsletter)

Next up: Design Review in 40 min w/ Alex, Jordan
- Last meeting you assigned Alex wireframes — no update yet
- Open task: "Review PR #234" (overdue 1 day)

1 overdue task, 3 due today

Need me to prep the Design Review or handle Sarah's email?
```

### Silent when nothing changed
No briefing if workspace state is identical to last check. The EA doesn't walk in to say "nothing new."

### Architecture
- **New API route**: `POST /api/ai/briefing` — server-side endpoint that:
  1. Fetches workspace context (emails, calendar, tasks)
  2. Compares against cached previous state (in-memory or Redis)
  3. If changed: runs structured data through Gemini with a briefing-specific prompt
  4. Returns briefing text + metadata (unread count, next meeting time, overdue count)
- **Client-side**: `useAIChat` hook gains `fetchBriefing()` that fires on mount + 15-min `setInterval`
- **Diff logic**: Server compares `{unreadCount, nextMeetingId, overdueTaskCount, emailIds}` — only generates new briefing if any field changed

### Email triage (built into briefing)
Server-side function (not a Gemini tool) that classifies unread emails:
- **Urgent**: From known contacts, contains deadline language, reply-needed
- **Action needed**: Requires response but not time-critical
- **FYI**: Newsletters, CC'd threads, status updates

Classification uses Gemini — the briefing prompt includes unread email summaries and asks for prioritized output.

### Meeting prep (built into briefing)
When a meeting is within 30 minutes, the briefing auto-includes:
- Attendees + last email threads with them
- Pending tasks related to attendees or meeting topic
- Suggested talking points

---

## Feature 2: Auto-Memory

### What it does
Doodle silently saves important context from conversations without the user saying "remember this." A real EA just remembers.

### New Gemini tool: `save_memory`
```
name: "save_memory"
params: {
  category: enum["preference", "context", "task", "relationship", "habit"]
  content: string  // what to remember
  confidence: number  // 0-1 how confident this is worth saving
}
```

### What it auto-saves (via prompt instruction)
- Preferences: "I prefer morning meetings" → `{preference, "Prefers morning meetings", 0.9}`
- Relationships: "My manager is Sarah" → `{relationship, "Manager: Sarah Chen", 0.95}`
- Context: "Working on Q2 launch" → `{context, "Currently focused on Q2 launch", 0.8}`
- Habits: "I usually review PRs on Fridays" → `{habit, "Reviews PRs on Fridays", 0.7}`

### No confirmation
Prompt instructs: "Save memories silently. Do not say 'I'll remember that' or draw attention to it."

### Dedup
Before saving, check if a similar memory already exists (fuzzy match on content). Update instead of creating duplicates.

---

## Feature 3: EA Personality Overhaul

### System prompt rewrite
Replace the current chatty prompt with an EA-focused one:

**Tone rules:**
- Lead with data, not greetings
- Bullet points over paragraphs
- Bold critical items
- Only ask questions that require a decision
- Never say "Sure!", "Of course!", "Happy to help!"
- Use numbers: "3 unread, 1 urgent" not "you have some emails"

**Proactive behavior rules:**
- When workspace data shows unread emails: classify and surface important ones
- When a meeting is soon: offer prep
- When tasks are overdue: mention them
- When user mentions a person: check recent emails/meetings with them
- When user asks to "handle" something: chain actions (read → decide → act → confirm)

**Action chaining:**
- "Handle Sarah's email" → read email → determine intent → draft reply → show user → send on approval
- "Schedule a meeting with John" → check both calendars → propose time → create event → send invite
- "What do I need to do today?" → scan calendar + tasks + urgent emails → prioritize → present

**Confirmation protocol:**
- Read operations: execute immediately, no confirmation
- Write operations (send email, create event, create task): always confirm with a one-line summary before executing
- Delete operations: always confirm with explicit warning

---

## Feature 4: Enhanced Workspace Context

### Structured context return
Modify `buildWorkspaceContext()` to return both a string (for Gemini) and structured data (for diffing):

```typescript
interface WorkspaceSnapshot {
  unreadCount: number;
  emailIds: string[];         // for diff detection
  nextMeetingId: string | null;
  nextMeetingTime: string | null;
  overdueTaskCount: number;
  taskIds: string[];          // for diff detection
  timestamp: number;
}
```

### Richer email context
Fetch 10 unread emails (up from 5) with full snippets for triage classification.

### Time-aware calendar
Flag meetings happening within 30 minutes for auto-prep.

---

## Files Summary

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `src/app/api/ai/briefing/route.ts` | Briefing API endpoint |
| **Modify** | `src/lib/ai/prompts.ts` | EA personality + proactive behavior prompt |
| **Modify** | `src/lib/ai/tools.ts` | Add `save_memory` tool declaration + executor |
| **Modify** | `src/lib/google/workspace-context.ts` | Return structured snapshot + richer data |
| **Modify** | `src/hooks/useAIChat.ts` | Add `fetchBriefing()` + 15-min interval |
| **Modify** | `src/components/ai/ChatBubble.tsx` | Briefing message styling (compact cards) |

---

## Research-Informed Decisions

Based on Gemini function calling best practices (March 2026):

1. **Temperature**: Keep at default 1.0 for Gemini 3 — lower values cause looping
2. **Tool count**: Stay under 20 tools if possible. Triage and prep are server-side functions, not Gemini tools — keeps tool count at 30 (current 29 + save_memory)
3. **Parallel calling**: Our loop already handles multiple function calls per response
4. **Human-in-the-loop**: Enforce confirmation for all write operations via prompt + tool executor
5. **Thought signatures**: Handled automatically by `@google/generative-ai` SDK
6. **Docstrings = prompts**: Tool descriptions must be very specific about when to use each tool

---

## Verification

1. Login → Doodle's first message is a briefing (not "Hey! How's it going?")
2. Wait 15 min → new briefing appears only if workspace state changed
3. Say "handle Sarah's email" → Doodle reads, drafts reply, asks for confirmation
4. Say "I prefer afternoon meetings" → memory saved silently, no confirmation message
5. Say "prep me for the design review" → attendees, open threads, tasks, talking points
6. Say "what do I need to do today?" → prioritized list from calendar + tasks + urgent emails

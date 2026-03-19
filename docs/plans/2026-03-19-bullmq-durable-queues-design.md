# BullMQ Durable Queues — Design

## Problem

Several critical post-action operations run as fire-and-forget IIFEs inside API route handlers. If the server crashes, restarts, or the promise silently rejects, work is permanently lost:

1. **Post-meeting cascade** (`leave/route.ts` lines 149–317): 4-step IIFE — system message, MoM post, action item extraction, calendar update. All lost on crash.
2. **Calendar event cleanup** (`[meetingId]/route.ts` DELETE): `deleteEvent()` error swallowed, orphaned calendar events.
3. **Recording transcription** (already queued via BullMQ — no change needed).

## Design: Single Cascade Job with In-Process Workers

### Approach

- **One BullMQ job per fire-and-forget operation** — the post-meeting cascade becomes a single `post-meeting-cascade` job; calendar cleanup becomes a `calendar-sync` job.
- **Workers run in-process** via Next.js `instrumentation.ts` `register()` hook (only on `nodejs` runtime, never edge).
- **Idempotency** via DB checks: each cascade step checks whether its artifact already exists before creating it (e.g., check for existing "Meeting ended" system message before inserting).
- **Retry**: BullMQ default 3 attempts with exponential backoff (1s, 2s, 4s).

### Why not step-per-job (FlowProducer)?

Over-engineering. The cascade is logically one operation. Steps share data (convId, MoM). Breaking into 4 jobs adds coordination overhead, 4× queue names, and makes debugging harder. Idempotency guards handle the "step 3 fails, step 1 re-runs" case cleanly.

### Why not external worker processes?

Overkill at current scale. In-process workers are simpler to deploy (no separate process/Docker container). Migration to external workers is straightforward later: move the processor functions to a standalone entry point.

## Queue Names

```typescript
export const QUEUE_NAMES = {
  RECORDING_PROCESS: "recording-process",      // existing
  POST_MEETING_CASCADE: "post-meeting-cascade", // new
  CALENDAR_SYNC: "calendar-sync",               // new
} as const;
```

## Job Payloads

```typescript
// post-meeting-cascade
interface PostMeetingCascadePayload {
  meetingId: string;       // ObjectId as string
  hostId: string;          // host user ObjectId
  calendarEventId?: string;
  meetingTitle?: string;
  meetingCode?: string;
  endedAt: string;         // ISO date
}

// calendar-sync
interface CalendarSyncPayload {
  action: "delete";
  userId: string;
  calendarEventId: string;
  meetingId: string;       // for logging
}
```

## Idempotency Strategy

**Post-meeting cascade worker:**
1. Find conversation by `meetingId` — if none, skip (no-op).
2. Check for existing "Meeting ended." system message in that conversation (query by `type: "system"`, `content: "Meeting ended."`, `conversationId`). If found, skip step 1.
3. Fetch meeting document for MoM data. If `mom.summary` exists and no MoM agent message exists yet, post it.
4. Same for action items — check by `agentMeta.pendingAction.actionType: "create_tasks_from_meeting"`.
5. Calendar update — idempotent by nature (PUT/PATCH to same event).

**Calendar sync worker:**
- `deleteEvent()` is idempotent — deleting an already-deleted event returns 404/410, which we treat as success.

## Worker Architecture

```
src/lib/infra/jobs/
  queue.ts              — queue factory + names (modified)
  types.ts              — job payload interfaces (new)
  start-workers.ts      — worker startup function (new)
  workers/
    post-meeting-cascade.ts  — cascade processor (new)
    calendar-sync.ts         — calendar delete processor (new)
```

Workers are started once in `instrumentation.ts` → `register()` when `NEXT_RUNTIME === "nodejs"`.

## Graceful Shutdown

`start-workers.ts` exports a `closeAllWorkers()` function. Called alongside `closeAllQueues()` during `SIGTERM`/`SIGINT`.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/infra/jobs/queue.ts` | Add `POST_MEETING_CASCADE`, `CALENDAR_SYNC` queue names |
| `src/lib/infra/jobs/types.ts` | New: job payload types |
| `src/lib/infra/jobs/start-workers.ts` | New: worker startup + shutdown |
| `src/lib/infra/jobs/workers/post-meeting-cascade.ts` | New: cascade processor |
| `src/lib/infra/jobs/workers/calendar-sync.ts` | New: calendar sync processor |
| `src/instrumentation.ts` | Start workers on server boot |
| `src/app/api/meetings/[meetingId]/leave/route.ts` | Replace IIFE with `queue.add()` |
| `src/app/api/meetings/[meetingId]/route.ts` | Replace inline `deleteEvent` with `queue.add()` |

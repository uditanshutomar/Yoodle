# Architectural Enhancement Opportunities

> Identified during deep audit (March 2026). These are not bugs — they are reliability and performance improvements that require significant refactoring. Ordered by recommended implementation priority.

---

## 1. Google API Retry Wrappers

**Complexity:** Low | **Impact:** High reliability | **Estimated Time:** 1–2 days

### Problem

Only one Google API call (`drive-recordings.ts:139`) uses `withRetry()`. All other Gmail, Calendar, Sheets, and Slides operations fail immediately on transient errors (429 rate limit, 502/503 outages).

### Affected Files

| API | File | Lines | Has Retry |
|-----|------|-------|-----------|
| Gmail.listEmails | `src/lib/google/gmail.ts` | 40–46 | ❌ |
| Gmail.sendEmail | `src/lib/google/gmail.ts` | 178–184 | ❌ |
| Gmail.replyToEmail | `src/lib/google/gmail.ts` | 242–294 | ❌ |
| Gmail.modifyLabels | `src/lib/google/gmail.ts` | 313–321 | ❌ |
| Calendar.listEvents | `src/lib/google/calendar.ts` | 48–55 | ❌ |
| Calendar.createEvent | `src/lib/google/calendar.ts` | 74–98 | ❌ |
| Calendar.updateEvent | `src/lib/google/calendar.ts` | 129–133 | ❌ |
| Calendar.deleteEvent | `src/lib/google/calendar.ts` | 175–178 | ❌ |
| Sheets.readSheet | `src/lib/google/sheets.ts` | 30–34 | ❌ |
| Sheets.writeSheet | `src/lib/google/sheets.ts` | 61–66 | ❌ |
| Sheets.appendToSheet | `src/lib/google/sheets.ts` | 82–87 | ❌ |
| Slides.createPresentation | `src/lib/google/slides.ts` | 30–32 | ❌ |
| Slides.addSlide | `src/lib/google/slides.ts` | 66–80 | ❌ |
| Drive.uploadRecording | `src/lib/google/drive-recordings.ts` | 139–153 | ✅ |

### Existing Infrastructure

A `withRetry()` utility already exists at `src/lib/utils/retry.ts` (lines 4–35) with exponential backoff + jitter, and an `isTransientError()` helper (lines 42–71) that detects 429, 500, 502, 503.

### Recommended Implementation

Create `src/lib/google/retry-wrapper.ts`:

```typescript
import { withRetry, isTransientError } from "@/lib/utils/retry";

export async function withGoogleRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 4,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    retryOn: (error: unknown) => {
      if (!isTransientError(error)) return false;
      const status = (error as any)?.status ?? (error as any)?.response?.status;
      // Retry 429 (rate limit), 500, 502, 503; NOT 401/403
      return [429, 500, 502, 503].includes(status);
    },
  });
}
```

Then wrap every Google API call:

```typescript
const res = await withGoogleRetry(() =>
  gmail.users.messages.list({ userId: "me", maxResults: 10 })
);
```

---

## 2. BullMQ Durable Queues

**Complexity:** High | **Impact:** Critical for data integrity | **Estimated Time:** 5–7 days

### Problem

Only recording transcription uses BullMQ (`RECORDING_PROCESS` queue). Multiple important operations use fire-and-forget patterns — if the server crashes mid-operation, work is lost with no retry.

### Current Queue Setup

- **File:** `src/lib/infra/jobs/queue.ts` (lines 1–83)
- **Only queue:** `RECORDING_PROCESS`
- **Config:** 3 attempts, exponential backoff, keeps 100 completed / 500 failed

### Fire-and-Forget Operations That Need Queues

1. **Post-Meeting Cascade** (`src/app/api/meetings/[meetingId]/leave/route.ts`, lines 149–317)
   - Fire-and-forget IIFE: `(async () => { ... })().catch(...)`
   - Posts "meeting ended" message, MoM, action items, calendar updates
   - Each section has its own try-catch, but no retry on failure
   - **Risk:** If server crashes during cascade, meeting data is partially lost

2. **Email Sending** (`src/lib/google/gmail.ts`, lines 149–190)
   - `sendEmail()` is a direct API call with no queue or retry
   - AI agent emails fail silently

3. **Google Drive Upload** (`src/lib/google/drive-recordings.ts`, lines 139–153)
   - Has `withRetry()` but not durable — limited to 3 in-process retries
   - If server restarts during upload, recording is lost

4. **Calendar Sync** (`src/app/api/meetings/[meetingId]/route.ts`)
   - Calendar event deletion on meeting cancel is fire-and-forget

### Recommended New Queues

```typescript
export const QUEUE_NAMES = {
  RECORDING_PROCESS: "recording-process",
  POST_MEETING_CASCADE: "post-meeting-cascade",
  EMAIL_SEND: "email-send",
  CALENDAR_SYNC: "calendar-sync",
  GOOGLE_DRIVE_UPLOAD: "google-drive-upload",
} as const;
```

Each needs a corresponding worker file in `src/lib/infra/jobs/workers/`.

---

## 3. Circuit Breaker Patterns

**Complexity:** Medium | **Impact:** Prevents cascading failures | **Estimated Time:** 3–4 days

### Problem

When an external service goes down (Google, Deepgram, LiveKit), every request to that service fails immediately and ties up resources. No circuit breaker prevents repeated calls to a known-down service.

### External Service Audit

| Service | File | Retry | Circuit Breaker |
|---------|------|-------|-----------------|
| Google Gmail | `src/lib/google/gmail.ts` | ❌ | ❌ |
| Google Calendar | `src/lib/google/calendar.ts` | ❌ | ❌ |
| Google Drive | `src/lib/google/drive-recordings.ts` | ✅ (3x) | ❌ |
| Google Sheets | `src/lib/google/sheets.ts` | ❌ | ❌ |
| Google Slides | `src/lib/google/slides.ts` | ❌ | ❌ |
| Deepgram STT | `src/lib/stt/deepgram.ts` | ❌ | ❌ |
| LiveKit | `src/lib/transport/livekit-transport.ts` | ❌ | ❌ |
| Redis | `src/lib/infra/redis/client.ts` | ✅ (ioredis builtin) | Partial |
| MongoDB | `src/lib/infra/db/client.ts` | Mongoose handles | Partial |

### Recommended Implementation

Create `src/lib/infra/circuit-breaker.ts`:

```typescript
export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 60_000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = "half-open";
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
    }

    try {
      const result = await fn();
      if (this.state === "half-open") {
        this.state = "closed";
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.failureThreshold) {
        this.state = "open";
      }
      throw err;
    }
  }
}

// Per-service instances
export const googleBreaker = new CircuitBreaker("google-apis", 5, 60_000);
export const deepgramBreaker = new CircuitBreaker("deepgram", 3, 30_000);
export const livekitBreaker = new CircuitBreaker("livekit", 2, 45_000);
```

---

## 4. LiveKit Reconnect

**Complexity:** Medium | **Impact:** Meeting stability | **Estimated Time:** 2–3 days

### Problem

LiveKit connection in `src/lib/transport/livekit-transport.ts` has no reconnection logic. If the network drops, the connection state becomes "disconnected" permanently.

### Current Implementation

**File:** `src/lib/transport/livekit-transport.ts`

- **Join method (lines 125–158):** Calls `this.room.connect(...)` once. On error, disconnects and rethrows.
- **Room listeners (lines 351–417):** Listens to `ConnectionStateChanged` and maps to app states, but no reconnection attempt.
- **No exponential backoff**, no max retry limit, no token refresh handling.

### Recommended Implementation

```typescript
private async reconnectWithBackoff(maxRetries = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.room.connect(this.livekitUrl, this.token, {
        autoSubscribe: true,
      });
      this.connectionState = "connected";
      return;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      const jitter = delay * 0.2 * Math.random();
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
}
```

Add to `ConnectionStateChanged` listener:

```typescript
if (state === ConnectionState.Disconnected && this.shouldReconnect) {
  this.reconnectWithBackoff().catch((err) => {
    log.error({ err }, "LiveKit reconnection failed after all retries");
    this.connectionState = "disconnected";
  });
}
```

### Additional Considerations

- LiveKit tokens expire — need a token refresh mechanism before reconnect
- Distinguish transient failures (network blip) from auth failures (expired token, kicked)
- Cap total reconnection time to avoid indefinite retry loops

---

## 5. BroadcastChannel Tab Coordination

**Complexity:** Medium | **Impact:** ~66% server load reduction per extra tab | **Estimated Time:** 2–3 days

### Problem

Each browser tab independently polls the server. With 3 tabs open, the server receives 3× the polling requests.

### Current Polling Hooks

| Hook | File | Interval | visibilityState Guard |
|------|------|----------|-----------------------|
| useConversations | `src/hooks/useConversations.ts` | 10s | ✅ (line 79) |
| useTotalUnread | `src/hooks/useTotalUnread.ts` | 15s | ✅ (line 21) |
| useInsightCount | `src/hooks/useInsightCount.ts` | 60s | ✅ (line 28) |
| useAIChat | `src/hooks/useAIChat.ts` | 15min | ❌ No guard |

All have `document.visibilityState === "hidden"` guards (added during audit), so hidden tabs don't poll. But multiple visible tabs still poll independently.

### Recommended Implementation

Create `src/hooks/useBroadcastPoll.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";

export function useBroadcastPoll<T>(
  channelName: string,
  fetchFn: () => Promise<T>,
  onData: (data: T) => void,
  intervalMs: number
) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    // Listen for data from other tabs
    channel.onmessage = (event) => {
      if (event.data.type === channelName) {
        onData(event.data.payload);
      }
    };

    // Only poll if this tab is visible
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const data = await fetchFn();
        onData(data);
        // Broadcast to sibling tabs
        channel.postMessage({ type: channelName, payload: data });
      } catch { /* handled by fetchFn */ }
    };

    poll();
    const interval = setInterval(poll, intervalMs);

    return () => {
      clearInterval(interval);
      channel.close();
    };
  }, [channelName, fetchFn, onData, intervalMs]);
}
```

Then refactor each hook to use `useBroadcastPoll` instead of raw `setInterval`.

### Note on `useAIChat`

This hook (`src/hooks/useAIChat.ts`) is missing the `document.visibilityState` guard that was added to the other three hooks. Should be added as a quick fix independent of BroadcastChannel.

---

## Implementation Priority Matrix

| # | Enhancement | Complexity | Reliability Impact | Performance Impact | Recommended Order |
|---|-------------|-----------|-------------------|-------------------|-------------------|
| 1 | Google API Retries | Low | ⭐⭐⭐⭐ | Low | **First** (quick win) |
| 2 | BullMQ Durable Queues | High | ⭐⭐⭐⭐⭐ | Low | **Second** (critical) |
| 3 | Circuit Breakers | Medium | ⭐⭐⭐⭐ | Moderate | **Third** |
| 4 | LiveKit Reconnect | Medium | ⭐⭐⭐ | Low | **Fourth** |
| 5 | BroadcastChannel Tabs | Medium | N/A | ⭐⭐⭐⭐ | **Fifth** (optimization) |

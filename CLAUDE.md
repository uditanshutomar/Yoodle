# CLAUDE.md — Yoodle Project Guide

## Project Overview

Yoodle is a Next.js App Router application for meetings, collaboration, and AI-powered workspace management. It integrates Google Workspace APIs (Gmail, Calendar, Drive, Sheets, Slides, Docs), LiveKit for real-time communication, Deepgram for speech-to-text, and Gemini for AI.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** MongoDB via Mongoose
- **Cache/Pub-Sub:** Redis (ioredis)
- **Testing:** Vitest (`npx vitest run`)
- **Build:** `npx next build`
- **Linting:** ESLint with React Compiler rules (no ref access during render)

## Commands

```bash
npx vitest run          # Run all tests (763 tests, ~7s)
npx next build          # Production build with TypeScript + ESLint checks
npx next dev            # Development server
```

## Architecture Patterns

### API Routes

- All API routes use `withHandler()` wrapper from `src/lib/infra/api/with-handler.ts`
- Provides CSRF protection, Sentry error capture, Zod error handling, request logging
- Errors must be **thrown** (not returned) — `throw new BadRequestError()`, `throw new NotFoundError()`
- `successResponse(data, status?)` wraps response as `{ success: true, data }`
- `withHandler` catches unknown `Error` instances and returns sanitized 500 (never leaks messages)

### Error Classes

- `BadRequestError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `AppError` from `@/lib/infra/api/errors`
- `UnauthorizedError` — for 401 responses (invalid/expired JWT)
- `RateLimitError` — for 429 responses (rate limit exceeded)
- Always prefer specific error classes over bare `throw new Error()`

### Authentication

- **Two-layer auth:** JWT session token (cookie-based) + Google OAuth tokens (per-user, stored in DB)
- `getUserIdFromRequest(req)` — extracts and validates JWT from cookie, returns userId string
- `authenticateRequest(req)` — full auth check including user blacklist/ban status
- Google OAuth tokens in `user.googleTokens` — auto-refreshed via `getGoogleClientForUser()`
- JWT secret in `process.env.JWT_SECRET`, OAuth credentials in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

### MongoDB

- Always use `new mongoose.Types.ObjectId(stringId)` when querying `$or` conditions mixing hostId/participants.userId — string-to-ObjectId comparison silently fails
- Validate ObjectIds with `mongoose.Types.ObjectId.isValid()` before casting
- Use `findOneAndUpdate` with status filters for atomic state transitions (avoid read-then-write TOCTOU)

### Google APIs

- All Google API calls are wrapped with `withGoogleRetry()` from `src/lib/google/retry-wrapper.ts`
- Composition order: retry wraps breaker — each individual attempt is circuit-broken, so N failures (not N × retries) opens the breaker
- Provides retry (3 attempts, exponential backoff, jitter) for transient errors (429, 500, 502, 503)
- `CircuitBreakerOpenError` is excluded from retries (retrying an open breaker is pointless)
- Helper: `getGoogleServices(userId)` returns all authenticated API clients

### External Services

- **Circuit breakers** in `src/lib/infra/circuit-breaker.ts` for Google (5 failures / 60s), Deepgram (3 / 30s), LiveKit (3 / 45s)
- Half-open state allows one probe request at a time (`probeInFlight` guard prevents probe storms)
- **Retry utility** in `src/lib/utils/retry.ts` — `withRetry()` and `isTransientError()`
- `isTransientError()` checks `error.status`, `error.response.status`, `error.code`, and message heuristics
- **Note:** Circuit breaker state is in-memory — not shared across serverless instances

### Client-Side Hooks

- Polling hooks use `useBroadcastPoll` for cross-tab coordination (only visible tab polls): `useConversations`, `useTotalUnread`, `useInsightCount`
- `useBroadcastPoll` has a `disposed` guard to prevent state updates after unmount
- `document.visibilityState === "hidden"` guard on all polling intervals
- React Compiler is active — **never assign ref.current during render**, only in effects/handlers
- LiveKit transport uses SDK-native `reconnectPolicy` with exponential backoff (1s → 16s, max 5 attempts)

### Pagination

- Always clamp `limit` with `Math.max(1, Math.min(parsed, MAX))` to prevent negative values
- Always clamp `page` with `Math.max(parsed, 1)`

## Key Directories

```
src/app/api/          # API routes (Next.js App Router)
src/lib/google/       # Google Workspace integrations (gmail, calendar, drive, sheets, slides, docs)
src/lib/ai/           # AI tools, Gemini streaming, workflows
src/lib/infra/        # DB models, Redis, auth, logging, circuit breaker, rate limiting
src/lib/transport/    # LiveKit transport layer
src/hooks/            # Client-side React hooks
src/components/       # React components
```

## Testing Conventions

- Test files live next to source: `__tests__/route.test.ts`
- Use `vi.mock()` for module mocking, `vi.fn()` for function mocks
- Mock chain pattern for Mongoose: `{ select: vi.fn().mockReturnThis(), lean: vi.fn() }`
- Always mock `@/lib/infra/db/client`, `@/lib/infra/api/rate-limit`, `@/lib/infra/auth/middleware`

## Participant Status Types

- Meeting participants: `"invited" | "joined" | "left"` (no "denied" — check the `PARTICIPANT_STATUSES` const in `src/lib/infra/db/models/meeting.ts`)
- Roles: `"host" | "co-host" | "participant"`

## Security Checklist

- Avatar URLs must be HTTPS-only (Zod `.refine()`)
- Email not included in `.populate()` selects (PII leak prevention)
- OAuth state deserialized with Zod schema (not raw `JSON.parse`)
- `Promise.allSettled` for batch operations where partial failure is acceptable
- AI tool args get runtime type coercion (Gemini sends wrong types)
- AI memory capped at 200 per user with LRU eviction

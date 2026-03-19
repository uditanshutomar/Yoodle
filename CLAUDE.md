# CLAUDE.md — Yoodle Project Guide

## Project Overview

Yoodle is a Next.js App Router application for meetings, collaboration, and AI-powered workspace management. It integrates Google Workspace APIs (Gmail, Calendar, Drive, Sheets, Slides, Docs), LiveKit for real-time communication, Deepgram for speech-to-text, and Gemini for AI. The AI assistant is called "Yoodler".

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19.2
- **Language:** TypeScript (strict mode)
- **Database:** MongoDB via Mongoose 9.3
- **Cache/Pub-Sub:** Redis (ioredis)
- **AI SDK:** `@google/genai` (unified Google GenAI SDK — `@google/generative-ai` is deprecated, do not use)
- **Default Gemini model:** `gemini-3.1-pro-preview`
- **Testing:** Vitest 4.1 (`npx vitest run`)
- **Build:** `npx next build`
- **Linting:** ESLint with React Compiler rules (no ref access during render)

## Commands

```bash
npx vitest run          # Run all tests (896 tests, ~9s)
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
- `getUserIdFromRequest(req)` — convenience wrapper over `authenticateRequest`, returns userId string
- `authenticateRequest(req)` — extracts JWT (Bearer header → cookie → manual Cookie parse), checks token blacklist (revoked tokens), verifies signature. Does **not** check user-level ban status.
- Google OAuth tokens in `user.googleTokens` — auto-refreshed via `getGoogleClientForUser()`
- JWT secret in `process.env.JWT_SECRET`, OAuth credentials in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- Refresh tokens use a separate `JWT_REFRESH_SECRET` (not the same as `JWT_SECRET`)

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

### Gemini AI SDK

- Uses `@google/genai` SDK (unified Google GenAI SDK — do **not** use the deprecated `@google/generative-ai`)
- Singleton client via `getClient()` from `src/lib/ai/gemini.ts`
- Model name via `getModelName()` (defaults to `gemini-3.1-pro-preview`)
- Streaming: `ai.models.generateContentStream({ model, contents, config })`
- Non-streaming: `ai.models.generateContent({ model, contents })`
- Response text: `result.text` (getter, not method)
- Function calling types: `Type` (not `SchemaType`), `FunctionCallingConfigMode`, `Tool`

### External Services

- **Circuit breakers** in `src/lib/infra/circuit-breaker.ts` for Google (5 failures / 60s), Deepgram (3 / 30s), LiveKit (3 / 45s), Gemini (5 failures / 60s)
- Half-open state allows one probe request at a time (`probeInFlight` guard prevents probe storms)
- **Retry utility** in `src/lib/utils/retry.ts` — `withRetry()` and `isTransientError()`
- `isTransientError()` checks `error.status`, `error.response.status`, `error.code`, and message heuristics
- **Note:** Circuit breaker state is in-memory — not shared across serverless instances

### Redis Caching

- `getCached<T>(key)`, `setCache(key, value, ttlSeconds)`, `invalidateCache(key)` from `src/lib/infra/redis/cache.ts`
- All cache operations are non-fatal (try/catch, fall through to DB)
- Current cached endpoints: session (60s), profile (60s), conversations (15s), unread count (10s)
- Cache invalidation on writes (messages invalidate conversations + unread for all participants)

### Shared Redis Pub/Sub

- `sharedSubscriber` from `src/lib/infra/redis/pubsub.ts`
- Single Redis connection for all SSE subscribers (instead of one per client)
- In-process fan-out with reference counting per channel

### Client-Side Hooks

- Polling hooks use `useBroadcastPoll` for cross-tab coordination (only visible tab polls): `useConversations`, `useTotalUnread`, `useInsightCount`
- `useBroadcastPoll` has a `disposed` guard to prevent state updates after unmount
- `document.visibilityState === "hidden"` guard on all polling intervals
- React Compiler is active — **never assign ref.current during render**, only in effects/handlers
- LiveKit transport uses SDK-native `reconnectPolicy` with exponential backoff (1s → 16s, max 5 attempts)

### Pagination

- Always clamp `limit` with `Math.max(1, Math.min(parsed, MAX))` to prevent negative values
- Always clamp `page` with `Math.max(parsed, 1)`

### Logging

- `createLogger(namespace)` from `@/lib/infra/logger` — structured logger with namespace prefix
- Use `log.info()`, `log.warn()`, `log.error()` with structured data: `log.error({ err, userId }, "message")`
- Log level controlled by `LOG_LEVEL` env var (default: `info`)

### Rate Limiting

- Redis-backed sliding window rate limiter in `src/lib/infra/api/rate-limit.ts`
- Presets: `auth` (30/min), `session` (30/min), `ai` (20/min), `voice` (10/min), `meetings` (60/min), `calendar` (40/min), `general` (100/min)
- Applied per-route via `await checkRateLimit(req, "ai")` — routes call it explicitly with their group
- Throws `RateLimitError` (429) when exceeded

### Feature Flags

- `src/lib/features/flags.ts` — edition-based flags (`community` vs `cloud`)
- Set via `YOODLE_EDITION` env var (default: `community`)
- `features.isCloud`, `features.ghostRooms`, `features.liveCaptions`, `features.maxParticipantsPerRoom`, etc.
- Community edition is free/self-hostable; cloud adds premium features

### Server-Only Guards

- Critical server modules import `"server-only"` to prevent accidental client-side imports
- Guarded modules: `db/client.ts`, `auth/jwt.ts`, `auth/middleware.ts`, `ai/gemini.ts`
- Tests must mock `vi.mock("server-only", () => ({}))` when importing these modules

### Next.js Proxy

- Next.js 16 renamed `middleware.ts` to `proxy.ts`. The function export is `proxy` (not `middleware`).

### Durable Job Queues (BullMQ)

- Infrastructure: `src/lib/infra/jobs/` — queue factory, connection, workers, types
- **Queue names** (`QUEUE_NAMES` in `queue.ts`): `recording-process` (defined, no worker yet), `post-meeting-cascade`, `calendar-sync`
- **Producers**: API routes enqueue jobs via `getQueue(QUEUE_NAMES.X).add(name, payload, { jobId })`
- **Workers**: Started in-process via `instrumentation.ts` → `startWorkers()` (nodejs runtime only)
- **Payloads**: Typed in `types.ts` — must be JSON-serializable (no ObjectId/Date/Buffer)
- **Retry**: 3 attempts, exponential backoff (1s, 2s, 4s). Use `UnrecoverableError` for non-retryable failures (e.g., 401/403)
- **Idempotency**: Workers check DB for existing artifacts before creating (e.g., check for "Meeting ended." message before inserting)
- **Graceful shutdown**: `closeAllWorkers()` + `closeAllQueues()` on SIGTERM/SIGINT — no `process.exit()` (let Next.js handle exit)
- **Type safety**: `getQueue()` accepts `QueueName` (union of known queue names), not arbitrary strings
- **Adding a new queue**: (1) add name to `QUEUE_NAMES`, (2) add payload type to `types.ts`, (3) create processor in `workers/`, (4) register worker in `start-workers.ts`

### Environment Variables

- **Required:** `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_APP_URL`
- **Optional:** `DEEPGRAM_API_KEY`, `NEXT_PUBLIC_LIVEKIT_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `CRON_SECRET`, `LOG_LEVEL`, `HEALTH_DETAIL_SECRET`, `GEMINI_MODEL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **Edition:** `YOODLE_EDITION` (`community` | `cloud`)
- See `.env.example` for full list

## Key Directories

```
src/app/api/          # API routes (Next.js App Router)
src/lib/ai/           # AI tools, Gemini streaming, workflows
src/lib/board/        # Board/task cross-domain AI tools
src/lib/chat/         # Agent processor, message transform
src/lib/ghost/        # Ghost room consensus, ephemeral store
src/lib/google/       # Google Workspace integrations (gmail, calendar, drive, sheets, slides, docs)
src/lib/infra/        # DB models, Redis, auth, logging, circuit breaker, rate limiting, BullMQ jobs
src/lib/infra/redis/  # Redis cache, pub/sub, client
src/lib/livekit/      # LiveKit config, data message types
src/lib/meetings/     # Meeting helpers, room session
src/lib/stt/          # Deepgram speech-to-text integration
src/lib/transport/    # LiveKit transport layer
src/lib/utils/        # Retry, ID generation, XML utilities
src/lib/workspace/    # Workspace helpers
src/lib/features/     # Edition-based feature flags
src/hooks/            # Client-side React hooks
src/components/       # React components (desk, board, meeting, chat, ghost, pulse, ai, ui, layout)
```

## Testing Conventions

- Test files live next to source: `__tests__/route.test.ts`
- Use `vi.mock()` for module mocking, `vi.fn()` for function mocks
- Mock chain pattern for Mongoose: `{ select: vi.fn().mockReturnThis(), lean: vi.fn() }`
- Always mock `@/lib/infra/db/client`, `@/lib/infra/api/rate-limit`, `@/lib/infra/auth/middleware`
- Always mock `server-only` when testing server modules: `vi.mock('server-only', () => ({}))`
- Mock `@/lib/infra/redis/cache` with `getCached`, `setCache`, `invalidateCache`

## Participant Status Types

- Meeting participants: `"invited" | "joined" | "left"` (no "denied" — check the `PARTICIPANT_STATUSES` const in `src/lib/infra/db/models/meeting.ts`)
- Roles: `"host" | "co-host" | "participant"`

## Security Checklist

- Avatar URLs must be HTTPS-only (Zod `.refine()`)
- Email not included in `.populate()` selects (PII leak prevention)
- OAuth state deserialized with Zod schema (not raw `JSON.parse`)
- OAuth state schema uses `.strict()` (not `.passthrough()`)
- `Promise.allSettled` for batch operations where partial failure is acceptable
- AI tool args get runtime type coercion (Gemini sends wrong types)
- AI memory capped at 200 per user with LRU eviction
- Health endpoint service details gated behind `HEALTH_DETAIL_SECRET` header
- Recording speakerId validated against meeting participants
- `server-only` guards prevent accidental client-side import of secrets

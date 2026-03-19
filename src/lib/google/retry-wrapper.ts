import { withRetry, isTransientError } from "@/lib/utils/retry";
import { googleBreaker } from "@/lib/infra/circuit-breaker";

/**
 * Wrap a Google API call with circuit breaker + retry logic.
 *
 * 1. Circuit breaker prevents hammering a known-down Google API.
 * 2. Retries on 429 (rate limit), 500, 502, 503 with exponential backoff + jitter.
 * 3. Does NOT retry on 401 (expired token — handled by OAuth refresh) or 403 (permission denied).
 */
export async function withGoogleRetry<T>(fn: () => Promise<T>): Promise<T> {
  return googleBreaker.execute(() =>
    withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      retryOn: (error: unknown) => isTransientError(error),
    })
  );
}

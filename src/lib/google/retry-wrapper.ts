import { withRetry, isTransientError } from "@/lib/utils/retry";
import { googleBreaker, CircuitBreakerOpenError } from "@/lib/infra/circuit-breaker";

/**
 * Wrap a Google API call with circuit breaker + retry logic.
 *
 * Ordering: retry wraps breaker — each individual attempt goes through the
 * circuit breaker. This means N failures (not N × maxRetries) opens the breaker.
 *
 * 1. Each attempt is guarded by the circuit breaker.
 * 2. Retries on 429 (rate limit), 500, 502, 503 with exponential backoff + jitter.
 * 3. Does NOT retry on 401 (expired token — handled by OAuth refresh), 403 (permission denied),
 *    or CircuitBreakerOpenError (breaker is open — retrying is pointless).
 */
export async function withGoogleRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(
    () => googleBreaker.execute(fn),
    {
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      retryOn: (error: unknown) => {
        // Don't retry if the breaker is open — it will just throw again immediately
        if (error instanceof CircuitBreakerOpenError) return false;
        return isTransientError(error);
      },
    },
  );
}

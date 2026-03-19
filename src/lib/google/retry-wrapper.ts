import { withRetry, isTransientError } from "@/lib/utils/retry";

/**
 * Wrap a Google API call with retry logic for transient errors.
 *
 * Retries on 429 (rate limit), 500, 502, 503 with exponential backoff + jitter.
 * Does NOT retry on 401 (expired token — handled by OAuth refresh) or 403 (permission denied).
 */
export async function withGoogleRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    retryOn: (error: unknown) => isTransientError(error),
  });
}

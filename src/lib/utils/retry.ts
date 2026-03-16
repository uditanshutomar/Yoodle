/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    retryOn = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !retryOn(error)) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}

/**
 * Check if an error is a transient/retryable network error.
 * Checks the error's `status` or `code` property first (structured),
 * then falls back to message-string heuristics.
 */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  // Google API (GaxiosError) and Axios errors expose a numeric `status` or `response.status`
  const err = error as Record<string, unknown>;
  const status =
    (typeof err.status === "number" ? err.status : undefined) ??
    (typeof (err.response as Record<string, unknown>)?.status === "number"
      ? (err.response as Record<string, unknown>).status as number
      : undefined);

  if (status !== undefined) {
    // 429 Too Many Requests, 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable
    return status === 429 || status === 500 || status === 502 || status === 503;
  }

  // Fallback: check error message for network-level failures
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("socket hang up") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

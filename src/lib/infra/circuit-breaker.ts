import { createLogger } from "@/lib/infra/logger";

const log = createLogger("infra:circuit-breaker");

type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker to prevent cascading failures when an external service is down.
 *
 * States:
 * - **closed**: Requests flow through normally. Failures are counted.
 * - **open**: All requests are rejected immediately without calling the service.
 *   Transitions to half-open after `resetTimeoutMs`.
 * - **half-open**: One probe request is allowed through. If it succeeds, the
 *   breaker closes. If it fails, it reopens.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private probeInFlight = false;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(
    name: string,
    options: { failureThreshold?: number; resetTimeoutMs?: number } = {},
  ) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
  }

  /** Returns the current state of the circuit breaker. */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws `CircuitBreakerOpenError` if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Block concurrent requests while a half-open probe is in flight
    if (this.state === "half-open" && this.probeInFlight) {
      throw new CircuitBreakerOpenError(this.name, this.resetTimeoutMs);
    }

    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        // Only allow one probe request at a time in half-open state
        if (this.probeInFlight) {
          throw new CircuitBreakerOpenError(this.name, this.resetTimeoutMs);
        }
        this.state = "half-open";
        this.probeInFlight = true;
        log.info({ breaker: this.name }, "Circuit breaker half-open — allowing probe request");
      } else {
        throw new CircuitBreakerOpenError(this.name, this.resetTimeoutMs);
      }
    }

    try {
      const result = await fn();

      // Success — reset failure count to prevent stale accumulation
      if (this.state === "half-open") {
        log.info({ breaker: this.name }, "Circuit breaker closing — probe request succeeded");
        this.state = "closed";
        this.probeInFlight = false;
      }
      this.failureCount = 0;

      return result;
    } catch (err) {
      this.recordFailure();

      if (this.state === "half-open") {
        this.state = "open";
        this.probeInFlight = false;
        log.warn({ breaker: this.name }, "Circuit breaker reopened — probe request failed");
      }

      throw err;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold && this.state === "closed") {
      this.state = "open";
      log.warn(
        { breaker: this.name, failureCount: this.failureCount, resetMs: this.resetTimeoutMs },
        "Circuit breaker opened — too many consecutive failures",
      );
    }
  }

  /** Reset the breaker to closed state (e.g. for testing). */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.probeInFlight = false;
  }
}

/**
 * Error thrown when the circuit breaker is open and rejecting requests.
 */
export class CircuitBreakerOpenError extends Error {
  readonly breakerName: string;
  readonly retryAfterMs: number;

  constructor(breakerName: string, resetTimeoutMs: number) {
    super(`Circuit breaker [${breakerName}] is open — service unavailable`);
    this.name = "CircuitBreakerOpenError";
    this.breakerName = breakerName;
    this.retryAfterMs = resetTimeoutMs;
  }
}

// ── Shared breaker instances ────────────────────────────────────────

/** Google Workspace APIs (Gmail, Calendar, Drive, Sheets, Slides, Docs) */
export const googleBreaker = new CircuitBreaker("google-apis", {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
});

/** Deepgram speech-to-text API */
export const deepgramBreaker = new CircuitBreaker("deepgram", {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
});

/** LiveKit real-time communication */
export const livekitBreaker = new CircuitBreaker("livekit", {
  failureThreshold: 3,
  resetTimeoutMs: 45_000,
});

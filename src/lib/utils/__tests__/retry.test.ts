import { describe, it, expect, vi } from "vitest";
import { withRetry, isTransientError } from "../retry";

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelayMs: 1, maxRetries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry when retryOn returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("non-retryable"));
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1, retryOn: () => false })
    ).rejects.toThrow("non-retryable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects maxDelayMs cap", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const start = Date.now();
    await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5, maxRetries: 1 });
    const elapsed = Date.now() - start;
    // Should not wait more than ~10ms (maxDelayMs=5 + jitter)
    expect(elapsed).toBeLessThan(50);
  });
});

describe("isTransientError", () => {
  it("returns true for 429 status", () => {
    expect(isTransientError({ status: 429 })).toBe(true);
  });

  it("returns true for 500 status", () => {
    expect(isTransientError({ status: 500 })).toBe(true);
  });

  it("returns true for 502 status", () => {
    expect(isTransientError({ status: 502 })).toBe(true);
  });

  it("returns true for 503 status", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
  });

  it("returns false for 400 status", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
  });

  it("returns false for 404 status", () => {
    expect(isTransientError({ status: 404 })).toBe(false);
  });

  it("returns true for response.status (Axios-style)", () => {
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
  });

  it("returns true for network error messages", () => {
    expect(isTransientError(new Error("network error"))).toBe(true);
    expect(isTransientError(new Error("Request timeout"))).toBe(true);
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
  });

  it("returns false for non-network errors", () => {
    expect(isTransientError(new Error("Invalid input"))).toBe(false);
    expect(isTransientError(new Error("Not found"))).toBe(false);
  });

  it("returns false for null/undefined/non-objects", () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError("string")).toBe(false);
    expect(isTransientError(42)).toBe(false);
  });
});

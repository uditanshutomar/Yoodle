// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInsightCount } from "../useInsightCount";

/* ─── Helpers ─── */

function jsonResponse(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

/* ─── Tests ─── */

describe("useInsightCount", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initial count is 0", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useInsightCount(true));
    expect(result.current.count).toBe(0);
  });

  it("polls and fetches count on mount when enabled", async () => {
    fetchMock.mockReturnValue(jsonResponse({ data: { count: 5 } }));

    const { result } = renderHook(() => useInsightCount(true));

    // Flush the initial async poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.count).toBe(5);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/insights/count",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("polls at 60 second intervals", async () => {
    fetchMock.mockReturnValue(jsonResponse({ data: { count: 1 } }));

    const { result } = renderHook(() => useInsightCount(true));

    // Initial poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(1);

    // Advance by 60 seconds — second poll
    fetchMock.mockReturnValue(jsonResponse({ data: { count: 3 } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.count).toBe(3);
  });

  it("clearCount resets count to 0 via DELETE", async () => {
    fetchMock.mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return jsonResponse({});
      }
      return jsonResponse({ data: { count: 7 } });
    });

    const { result } = renderHook(() => useInsightCount(true));

    // Initial poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.count).toBe(7);

    // Clear
    await act(async () => {
      await result.current.clearCount();
    });

    expect(result.current.count).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/insights/count",
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
  });

  it("does not poll when disabled", async () => {
    const { result } = renderHook(() => useInsightCount(false));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.count).toBe(0);
  });

  it("handles fetch errors gracefully without crashing", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useInsightCount(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.count).toBe(0);
  });

  it("handles non-ok response gracefully", async () => {
    fetchMock.mockReturnValue(jsonResponse({}, false, 500));

    const { result } = renderHook(() => useInsightCount(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.count).toBe(0);
  });

  it("handles missing data.count gracefully (defaults to 0)", async () => {
    fetchMock.mockReturnValue(jsonResponse({ data: {} }));

    const { result } = renderHook(() => useInsightCount(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.count).toBe(0);
  });
});

"use client";

import { useState, useEffect, useCallback } from "react";

export function useInsightCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const clearCount = useCallback(async () => {
    try {
      await fetch("/api/ai/insights/count", { method: "DELETE", credentials: "include" });
      setCount(0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/ai/insights/count", { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCount(data.count ?? 0);
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return { count, clearCount };
}

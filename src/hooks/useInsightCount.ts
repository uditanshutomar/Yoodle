"use client";

import { useState, useEffect, useCallback } from "react";

export function useInsightCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/insights/count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const clearCount = useCallback(async () => {
    try {
      await fetch("/api/ai/insights/count", { method: "DELETE" });
      setCount(0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [enabled, fetchCount]);

  return { count, clearCount };
}

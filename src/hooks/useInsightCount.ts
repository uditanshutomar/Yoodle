"use client";

import { useState, useEffect, useCallback } from "react";

export function useInsightCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const clearCount = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/insights/count", { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setCount(0);
      } else {
        console.warn(`[useInsightCount] clearCount failed: ${res.status}`);
      }
    } catch (err) {
      console.debug("[useInsightCount] clearCount error:", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const poll = async () => {
      // Skip polling when tab is hidden to reduce server load
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/ai/insights/count", { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCount(data.data?.count ?? 0);
        }
      } catch (err) {
        console.debug("[useInsightCount] poll error:", err);
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

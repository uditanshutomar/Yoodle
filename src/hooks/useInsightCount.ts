"use client";

import { useState, useCallback } from "react";
import { useBroadcastPoll } from "./useBroadcastPoll";

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

  const fetchCount = useCallback(async (): Promise<number> => {
    const res = await fetch("/api/ai/insights/count", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch insight count");
    const data = await res.json();
    return data.data?.count ?? 0;
  }, []);

  useBroadcastPoll(
    "yoodle:insight-count",
    fetchCount,
    setCount,
    60_000,
    enabled,
  );

  return { count, clearCount };
}

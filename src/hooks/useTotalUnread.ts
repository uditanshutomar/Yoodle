"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";

/**
 * Lightweight hook that only tracks the total unread message count.
 * Uses a dedicated lightweight endpoint instead of fetching all conversations.
 */
export function useTotalUnread() {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!user) return;

    let active = true;

    const poll = async () => {
      // Skip polling when tab is hidden to reduce server load
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/conversations/unread-count", {
          credentials: "include",
        });
        if (!res.ok) return;

        const json = await res.json();
        if (json.success && typeof json.data?.totalUnread === "number") {
          if (active) setTotalUnread(json.data.totalUnread);
        }
      } catch (err) {
        // Badge will show stale count until next poll
        console.debug("[useTotalUnread] poll error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 15_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  return { totalUnread };
}

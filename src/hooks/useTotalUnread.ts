"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";

/**
 * Lightweight hook that only tracks the total unread message count.
 * Intended for sidebar badges — avoids pulling full conversation data.
 */
export function useTotalUnread() {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!user) return;

    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/conversations", {
          credentials: "include",
        });
        if (!res.ok) return;

        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const total = (json.data as { unreadCount?: number }[]).reduce(
            (sum, c) => sum + (c.unreadCount || 0),
            0,
          );
          if (active) setTotalUnread(total);
        }
      } catch {
        // Silent fail
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

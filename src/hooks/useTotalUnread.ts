"use client";

import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useBroadcastPoll } from "./useBroadcastPoll";

/**
 * Lightweight hook that only tracks the total unread message count.
 * Uses a dedicated lightweight endpoint instead of fetching all conversations.
 * Coordinates across tabs via BroadcastChannel — only the visible tab polls.
 */
export function useTotalUnread() {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnread = useCallback(async (): Promise<number> => {
    const res = await fetch("/api/conversations/unread-count", {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch unread count");
    const json = await res.json();
    if (json.success && typeof json.data?.totalUnread === "number") {
      return json.data.totalUnread;
    }
    throw new Error("Invalid response");
  }, []);

  useBroadcastPoll(
    "yoodle:total-unread",
    fetchUnread,
    setTotalUnread,
    15_000,
    !!user,
  );

  return { totalUnread };
}

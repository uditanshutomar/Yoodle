"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";

// ── Types ────────────────────────────────────────────────────────────────

export interface ConversationParticipant {
  _id: string;
  name: string;
  displayName?: string;
  avatar?: string;
}

export interface ConversationInfo {
  _id: string;
  type: "dm" | "group";
  name?: string;
  participants: ConversationParticipant[];
  lastMessage?: {
    content: string;
    sender: string;
    createdAt: string;
  };
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch conversations ──────────────────────────────────────────────

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/conversations", {
        credentials: "include",
        signal,
      });
      if (!res.ok) return;

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setConversations(json.data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Silent fail
    }
  }, []);

  // ── Initial load + polling ───────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      setLoading(true);
      await refresh(controller.signal);
      if (!controller.signal.aborted) setLoading(false);
    };

    load();

    const interval = setInterval(() => refresh(controller.signal), 10_000);
    return () => {
      controller.abort();
      abortRef.current = null;
      clearInterval(interval);
    };
  }, [user, refresh]);

  // ── Total unread ─────────────────────────────────────────────────────

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unreadCount || 0),
    0,
  );

  // ── Create DM ────────────────────────────────────────────────────────

  const createDM = useCallback(
    async (participantId: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "dm",
            recipientId: participantId,
          }),
        });
        if (!res.ok) return null;

        const json = await res.json();
        if (json.success && json.data?._id) {
          await refresh();
          return json.data._id as string;
        }
        return null;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  // ── Create group ─────────────────────────────────────────────────────

  const createGroup = useCallback(
    async (
      name: string,
      participantIds: string[],
    ): Promise<string | null> => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "group",
            name,
            participantIds,
          }),
        });
        if (!res.ok) return null;

        const json = await res.json();
        if (json.success && json.data?._id) {
          await refresh();
          return json.data._id as string;
        }
        return null;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  return {
    conversations,
    loading,
    totalUnread,
    createDM,
    createGroup,
    refresh,
  };
}

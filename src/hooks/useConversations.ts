"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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
  const [error, setError] = useState<string | null>(null);

  // ── Fetch conversations ──────────────────────────────────────────────

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/conversations", {
        credentials: "include",
        signal,
      });
      if (!res.ok) {
        setError(`Failed to load conversations (${res.status})`);
        return;
      }

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setConversations(json.data);
        setError(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load conversations");
    }
  }, []);

  // ── Initial load + polling with tab coordination ────────────────────

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      await refresh(controller.signal);
      if (!controller.signal.aborted) setLoading(false);
    };

    load();

    // BroadcastChannel: coordinate polling across tabs
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel("yoodle:conversations");
        channel.onmessage = (event: MessageEvent) => {
          if (event.data?.type === "yoodle:conversations" && Array.isArray(event.data.payload)) {
            setConversations(event.data.payload);
            setError(null);
          }
        };
      } catch {
        channel = null;
      }
    }

    // Fetch + broadcast wrapper used by the interval
    const pollAndBroadcast = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/conversations", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setConversations(json.data);
          setError(null);
          try { channel?.postMessage({ type: "yoodle:conversations", payload: json.data }); } catch { /* closed */ }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    };

    const interval = setInterval(pollAndBroadcast, 10_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        pollAndBroadcast();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      try { channel?.close(); } catch { /* already closed */ }
    };
  }, [user, refresh]);

  // ── Total unread ─────────────────────────────────────────────────────

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations],
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
        if (!res.ok) {
          setError(`Failed to create conversation (${res.status})`);
          return null;
        }

        const json = await res.json();
        if (json.success && json.data?._id) {
          await refresh();
          return json.data._id as string;
        }
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create conversation");
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
        if (!res.ok) {
          setError(`Failed to create group (${res.status})`);
          return null;
        }

        const json = await res.json();
        if (json.success && json.data?._id) {
          await refresh();
          return json.data._id as string;
        }
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create group");
        return null;
      }
    },
    [refresh],
  );

  return {
    conversations,
    loading,
    error,
    totalUnread,
    createDM,
    createGroup,
    refresh,
  };
}

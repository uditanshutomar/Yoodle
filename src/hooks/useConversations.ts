"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "./useAuth";
import { useBroadcastPoll } from "./useBroadcastPoll";

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

  // ── Fetch conversations (used by both initial load and mutations) ─────

  const fetchConversations = useCallback(async (): Promise<ConversationInfo[]> => {
    const res = await fetch("/api/conversations", {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`Failed to load conversations (${res.status})`);
    }
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      return json.data;
    }
    throw new Error("Invalid response");
  }, []);

  // ── Handle incoming data from poll or broadcast ───────────────────────

  const handleData = useCallback((data: ConversationInfo[]) => {
    setConversations(data);
    setError(null);
  }, []);

  // ── Polling with tab coordination via useBroadcastPoll ────────────────

  useBroadcastPoll(
    "yoodle:conversations",
    fetchConversations,
    handleData,
    10_000,
    !!user,
  );

  // ── Initial load (show loading spinner on first mount) ────────────────

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchConversations();
        if (!cancelled) {
          setConversations(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load conversations");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user, fetchConversations]);

  // ── Imperative refresh (for use after mutations) ──────────────────────

  const refresh = useCallback(async () => {
    try {
      const data = await fetchConversations();
      setConversations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    }
  }, [fetchConversations]);

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

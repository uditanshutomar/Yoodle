"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "./useAuth";

// ── Types ────────────────────────────────────────────────────────────────

export interface MessageSender {
  _id: string;
  name: string;
  displayName?: string;
  avatar?: string;
}

export interface Reaction {
  emoji: string;
  users: string[]; // user IDs
}

export interface ChatMsg {
  _id: string;
  conversationId: string;
  sender: MessageSender;
  content: string;
  replyTo?: string;
  reactions: Reaction[];
  createdAt: string;
  updatedAt: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user: _user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(
    new Map(),
  );

  // Refs for cleanup and cursor tracking
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const cursorRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // ── Fetch initial messages ───────────────────────────────────────────

  const fetchMessages = useCallback(
    async (before?: string) => {
      if (!conversationId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "30" });
        if (before) params.set("before", before);

        const res = await fetch(
          `/api/conversations/${conversationId}/messages?${params}`,
          { credentials: "include" },
        );
        if (!res.ok) return;

        const json = await res.json();
        if (!json.success) return;

        const fetched: ChatMsg[] = json.data.messages;

        if (fetched.length < 30) setHasMore(false);

        if (before) {
          // Prepend older messages
          setMessages((prev) => [...fetched, ...prev]);
        } else {
          // Initial load
          setMessages(fetched);
        }

        if (fetched.length > 0) {
          cursorRef.current = fetched[0]._id;
        }
      } catch {
        // Silent fail
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [conversationId],
  );

  // ── Load more (pagination) ───────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (loading || !hasMore || !cursorRef.current) return;
    fetchMessages(cursorRef.current);
  }, [loading, hasMore, fetchMessages]);

  // ── SSE connection ───────────────────────────────────────────────────

  useEffect(() => {
    if (!conversationId) return;

    const es = new EventSource(
      `/api/conversations/${conversationId}/stream`,
    );
    eventSourceRef.current = es;

    es.addEventListener("message", (e) => {
      try {
        const msg: ChatMsg = JSON.parse(e.data);
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });

        // If this message is from an agent, clear their thinking indicator
        if (msg.sender._id.startsWith("agent_")) {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(msg.sender._id);
            return next;
          });
        }
      } catch {
        // Skip malformed data
      }
    });

    es.addEventListener("typing", (e) => {
      try {
        const data = JSON.parse(e.data);
        const { userId: typerId, name } = data as {
          userId: string;
          name: string;
        };

        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(typerId, name);
          return next;
        });

        // Clear existing timer for this user
        const existing = typingTimersRef.current.get(typerId);
        if (existing) clearTimeout(existing);

        // Auto-clear after 3s
        const timer = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(typerId);
            return next;
          });
          typingTimersRef.current.delete(typerId);
        }, 3000);
        typingTimersRef.current.set(typerId, timer);
      } catch {
        // Skip
      }
    });

    es.addEventListener("reaction", (e) => {
      try {
        const data = JSON.parse(e.data);
        const { messageId, emoji, userId: reactUserId, action } = data as {
          messageId: string;
          emoji: string;
          userId: string;
          action: "add" | "remove";
        };

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg._id !== messageId) return msg;

            const reactions = msg.reactions.map((r) => ({ ...r, users: [...r.users] }));
            const existing = reactions.find((r) => r.emoji === emoji);

            if (action === "add") {
              if (existing) {
                if (!existing.users.includes(reactUserId)) {
                  existing.users.push(reactUserId);
                }
              } else {
                reactions.push({ emoji, users: [reactUserId] });
              }
            } else {
              if (existing) {
                existing.users = existing.users.filter(
                  (u) => u !== reactUserId,
                );
                if (existing.users.length === 0) {
                  const idx = reactions.indexOf(existing);
                  reactions.splice(idx, 1);
                }
              }
            }

            return { ...msg, reactions };
          }),
        );
      } catch {
        // Skip
      }
    });

    es.addEventListener("agent_thinking", (e) => {
      try {
        const data = JSON.parse(e.data);
        const { agentId, name } = data as { agentId: string; name: string };

        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(agentId, name);
          return next;
        });
      } catch {
        // Skip
      }
    });

    es.addEventListener("agent_thinking_done", (e) => {
      try {
        const data = JSON.parse(e.data);
        const { agentId } = data as { agentId: string };

        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(agentId);
          return next;
        });
      } catch {
        // Skip
      }
    });

    es.addEventListener("read", () => {
      // Optional: could update read receipts in the future
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [conversationId]);

  // ── Fetch on mount / conversation change ─────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    setMessages([]);
    setHasMore(true);
    cursorRef.current = null;
    setTypingUsers(new Map());

    if (conversationId) {
      fetchMessages();
    }

    return () => {
      isMountedRef.current = false;
      // Clear all typing timers
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timers = typingTimersRef.current;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [conversationId, fetchMessages]);

  // ── Actions ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, replyTo?: string) => {
      if (!conversationId || !content.trim()) return;

      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ content: content.trim(), replyTo }),
          },
        );
        if (!res.ok) return;

        const json = await res.json();
        if (json.success && json.data) {
          // Append if not already present (SSE might beat us)
          setMessages((prev) => {
            if (prev.some((m) => m._id === json.data._id)) return prev;
            return [...prev, json.data];
          });
        }
      } catch {
        // Silent fail
      }
    },
    [conversationId],
  );

  const sendTyping = useCallback(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [conversationId]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!conversationId) return;

      try {
        await fetch(`/api/conversations/${conversationId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageId, emoji }),
        });
      } catch {
        // Silent fail
      }
    },
    [conversationId],
  );

  const markAsRead = useCallback(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [conversationId]);

  return {
    messages,
    loading,
    hasMore,
    typingUsers,
    sendMessage,
    sendTyping,
    toggleReaction,
    markAsRead,
    loadMore,
  };
}

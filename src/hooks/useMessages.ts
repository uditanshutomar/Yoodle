"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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
  senderType?: "user" | "agent" | "system";
  /** Message type from DB — "system" for system messages, "text" for regular, "agent" for AI */
  type?: "text" | "system" | "agent" | "agent_channel";
  content: string;
  replyTo?: string;
  replyToMessage?: {
    content: string;
    sender: { name: string };
  };
  reactions: Reaction[];
  edited?: boolean;
  deleted?: boolean;
  agentMeta?: {
    toolCalls?: { name: string; status: string; summary?: string }[];
    actions?: { label: string; action: string; payload?: Record<string, unknown> }[];
    pendingAction?: {
      actionId: string;
      actionType: string;
      args: Record<string, unknown>;
      summary: string;
      status: string;
    };
    cards?: Array<Record<string, unknown>>;
    forUserId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(
    new Map(),
  );
  const [connected, setConnected] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);

  // SSE reconnect: incrementing this forces the SSE effect to re-run
  const [sseRetry, setSseRetry] = useState(0);

  // Refs for cleanup and cursor tracking
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const cursorRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const sseRetriesRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const optimisticIdRef = useRef(0);

  // ── Fetch initial messages ───────────────────────────────────────────

  const fetchMessages = useCallback(
    async (before?: string) => {
      if (!conversationId) return;

      // Abort any in-flight message fetch to prevent stale results
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "30" });
        if (before) params.set("before", before);

        const res = await fetch(
          `/api/conversations/${conversationId}/messages?${params}`,
          { credentials: "include", signal: controller.signal },
        );
        if (!res.ok) {
          console.error(`[useMessages] Fetch messages failed: ${res.status}`);
          return;
        }

        const json = await res.json();
        if (!json.success || !isMountedRef.current) return;

        const fetched: ChatMsg[] = json.data.messages;

        if (fetched.length < 30) setHasMore(false);

        if (before) {
          setMessages((prev) => [...fetched, ...prev]);
        } else {
          setMessages(fetched);
        }

        if (fetched.length > 0) {
          cursorRef.current = fetched[fetched.length - 1]._id;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
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

    // Helper: parse SSE JSON, return undefined on malformed data.
    // Separating parse from handler logic so bugs in state updates
    // aren't silently swallowed by the parse catch.
    function parseSSE<T>(raw: string): T | undefined {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    }

    es.addEventListener("message", (e) => {
      const msg = parseSSE<ChatMsg>(e.data);
      if (!msg) return;

      setMessages((prev) => {
        // Deduplicate: if SSE delivers a message already in the list, skip
        if (prev.some((m) => m._id === msg._id)) return prev;
        // If there's an optimistic message with matching content, replace it
        // (optimistic IDs start with "optimistic-")
        const optimisticIdx = prev.findIndex(
          (m) =>
            m._id.startsWith("optimistic-") &&
            m.content === msg.content,
        );
        if (optimisticIdx !== -1) {
          const next = [...prev];
          next[optimisticIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });

      // If this message is from an agent, clear their thinking indicator
      if (msg.senderType === "agent") {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(msg.sender._id);
          return next;
        });
      }
    });

    es.addEventListener("typing", (e) => {
      const data = parseSSE<{ userId: string; name: string }>(e.data);
      if (!data) return;
      const { userId: typerId, name } = data;

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
    });

    es.addEventListener("reaction", (e) => {
      const data = parseSSE<{
        messageId: string;
        emoji: string;
        userId: string;
        action: "add" | "remove";
      }>(e.data);
      if (!data) return;
      const { messageId, emoji, userId: reactUserId, action } = data;

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
    });

    es.addEventListener("agent_thinking", (e) => {
      const data = parseSSE<{ agentId: string; name: string }>(e.data);
      if (!data) return;
      const { agentId, name } = data;

      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(agentId, name);
        return next;
      });
    });

    es.addEventListener("agent_thinking_done", (e) => {
      const data = parseSSE<{ agentId: string }>(e.data);
      if (!data) return;

      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(data.agentId);
        return next;
      });
    });

    es.addEventListener("read", () => {
      // Optional: could update read receipts in the future
    });

    // ── Reconnection on error ────────────────────────────────────
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    es.onerror = () => {
      // EventSource auto-reconnects for transient errors (readyState=CONNECTING).
      // If readyState is CLOSED, the browser gave up — manually reconnect
      // with exponential backoff by re-triggering this effect.
      setConnected(false);
      if (es.readyState === EventSource.CLOSED) {
        const retries = sseRetriesRef.current;
        sseRetriesRef.current++;
        // First 5 retries: exponential backoff (1s, 2s, 4s, 8s, 16s)
        // After that: keep trying every 60s so recovery is still possible
        const delay = retries < 5
          ? Math.min(1000 * 2 ** retries, 30000)
          : 60000;
        reconnectTimer = setTimeout(() => {
          setSseRetry((n) => n + 1);
        }, delay);
      }
    };

    // Reset retry counter on successful connection + re-fetch to fill gaps
    es.onopen = () => {
      setConnected(true);
      if (sseRetriesRef.current > 0) {
        // Reconnected after a disconnect — fetch latest messages to fill the gap
        fetchMessages();
      }
      sseRetriesRef.current = 0;
    };

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es.close();
      eventSourceRef.current = null;
    };
    // sseRetry forces re-creation of EventSource on reconnect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, sseRetry]);

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
      // Abort any in-flight message fetch
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
      // Clear all typing timers
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timers = typingTimersRef.current;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [conversationId, fetchMessages]);

  // ── Actions ──────────────────────────────────────────────────────────

  const clearSendError = useCallback(() => setSendError(null), []);

  const sendMessage = useCallback(
    async (content: string, replyTo?: string) => {
      if (!conversationId || !content.trim()) return;

      // Clear previous send error
      setSendError(null);

      // Create optimistic message with a temporary ID
      const optimisticId = `optimistic-${Date.now()}-${++optimisticIdRef.current}`;
      const optimisticMsg: ChatMsg = {
        _id: optimisticId,
        conversationId,
        sender: { _id: "", name: "" }, // Filled by server; sender info shown via isOwn
        senderType: "user",
        content: content.trim(),
        replyTo,
        reactions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Immediately append the optimistic message so the UI feels instant
      setMessages((prev) => [...prev, optimisticMsg]);

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

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const errMsg = errBody?.error?.message || `Send failed (${res.status})`;
          // Remove optimistic message and surface error
          setMessages((prev) => prev.filter((m) => m._id !== optimisticId));
          setSendError(errMsg);
          return;
        }

        const json = await res.json();
        if (json.success && json.data) {
          // Replace optimistic message with real server message
          setMessages((prev) => {
            // SSE may have already delivered the real message — deduplicate
            const hasReal = prev.some((m) => m._id === json.data._id);
            if (hasReal) {
              // Remove the optimistic one; real one is already there
              return prev.filter((m) => m._id !== optimisticId);
            }
            // Replace optimistic with real
            return prev.map((m) => (m._id === optimisticId ? json.data : m));
          });
        }
      } catch (err) {
        // Network error — remove optimistic message and notify
        setMessages((prev) => prev.filter((m) => m._id !== optimisticId));
        setSendError(
          err instanceof Error ? err.message : "Failed to send message. Check your connection.",
        );
      }
    },
    [conversationId],
  );

  const sendTyping = useCallback(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
      credentials: "include",
    }).catch((err) => {
      // Best-effort — typing indicators are non-critical
      console.debug("[useMessages] Typing indicator failed:", err);
    });
  }, [conversationId]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!conversationId) return;

      try {
        const res = await fetch(`/api/conversations/${conversationId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageId, emoji }),
        });
        if (!res.ok) {
          console.error(`[useMessages] toggleReaction failed: ${res.status}`);
        }
      } catch (err) {
        console.error("[useMessages] toggleReaction network error:", err);
      }
    },
    [conversationId],
  );

  const markAsRead = useCallback(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      credentials: "include",
    }).catch((err) => {
      // Best-effort — read receipts are non-critical
      console.debug("[useMessages] markAsRead failed:", err);
    });
  }, [conversationId]);

  return {
    messages,
    loading,
    hasMore,
    typingUsers,
    connected,
    sendError,
    clearSendError,
    sendMessage,
    sendTyping,
    toggleReaction,
    markAsRead,
    loadMore,
  };
}

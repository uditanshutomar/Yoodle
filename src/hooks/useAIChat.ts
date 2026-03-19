"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "./useAuth";
import type { CardData } from "@/components/ai/cards/types";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "calling" | "success" | "error";
  summary?: string;
  /** For propose_action: the pending action data for inline accept/deny */
  pendingAction?: {
    actionId: string;
    type: string;
    args: Record<string, unknown>;
    summary: string;
  };
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  cards?: CardData[];
}

const STORAGE_KEY_PREFIX = "yoodle-ai-chat-messages";
const SESSIONS_KEY_PREFIX = "ai-chat-sessions";
const MAX_SESSIONS = 3;

function storageKey(userId?: string) {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}
function sessionsKey(userId?: string) {
  return userId ? `${SESSIONS_KEY_PREFIX}:${userId}` : SESSIONS_KEY_PREFIX;
}

export interface ChatSession {
  id: string;
  messages: AIChatMessage[];
  label?: string;
  createdAt: number;
}

function loadPersistedMessages(userId?: string): AIChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AIChatMessage[];
    // Only keep messages from the last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return parsed.filter((m) => m.timestamp > cutoff);
  } catch {
    return [];
  }
}

function persistMessages(messages: AIChatMessage[], userId?: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(messages));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function useAIChat() {
  const { user } = useAuth();
  const userId = user?.id;
  const [messages, setMessages] = useState<AIChatMessage[]>(() => loadPersistedMessages(userId));
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AIChatMessage[]>([]);
  const isStreamingRef = useRef(false);

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = sessionStorage.getItem(sessionsKey(userId));
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    typeof window !== "undefined" ? crypto.randomUUID() : "default"
  );
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Pending action detection callback
  const onPendingActionRef = useRef<((data: Record<string, unknown>) => void) | null>(null);

  const setOnPendingAction = useCallback((cb: (data: Record<string, unknown>) => void) => {
    onPendingActionRef.current = cb;
  }, []);

  // Keep refs in sync with state + persist to sessionStorage
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

  // Reload messages when user changes (prevents data leakage between users)
  useEffect(() => {
    setMessages(loadPersistedMessages(userId));
  }, [userId]);

  // Persist messages whenever they change (skip during streaming for perf)
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      persistMessages(messages, userId);
    }
  }, [messages, isStreaming, userId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !content.trim() || isStreamingRef.current) return;
      // Set ref immediately to prevent double-sends before state updates
      isStreamingRef.current = true;

      const userMsg: AIChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMsg: AIChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        toolCalls: [],
      };

      // Snapshot history BEFORE appending new messages to avoid sending the
      // current user message twice (once in history, once as `message`).
      const history = messagesRef.current
        .filter((m) => m.content.trim() !== "")
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            message: content.trim(),
            history,
            context: {
              name: user.displayName || user.name || undefined,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(errorData?.error?.message || `AI request failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream reader");

        const decoder = new TextDecoder();
        let accumulated = "";
        let toolCalls: ToolCall[] = [];
        let cards: CardData[] = [];
        let buffer = ""; // Buffer for incomplete SSE lines across chunks

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split("\n");

          // Keep the last element — it may be an incomplete line
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              let parsed: Record<string, unknown>;
              try {
                parsed = JSON.parse(data);
              } catch {
                // Skip malformed JSON
                continue;
              }

              if (parsed.error) {
                // Server-side error (Gemini failure, missing config, etc.)
                // Include retryable hint so the catch block can display appropriate message
                const err = new Error(parsed.error as string);
                (err as Error & { retryable?: boolean }).retryable = !!parsed.retryable;
                throw err;
              } else if (parsed.text) {
                // Text chunk — append to message content
                accumulated += parsed.text as string;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accumulated, toolCalls: [...toolCalls], cards: [...cards] }
                      : m
                  )
                );
              } else if (parsed.type === "tool_call") {
                // Tool is being called — add a pending indicator
                const tc: ToolCall = {
                  id: `tc-${Date.now()}-${parsed.name}`,
                  name: parsed.name as string,
                  args: (parsed.args || {}) as Record<string, unknown>,
                  status: "calling",
                };
                toolCalls = [...toolCalls, tc];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accumulated, toolCalls: [...toolCalls], cards: [...cards] }
                      : m
                  )
                );
              } else if (parsed.type === "tool_result") {
                // Tool finished — update only the FIRST matching "calling" entry with this name
                let matched = false;
                // Extract pending action data if this is a propose_action result
                const isProposeAction =
                  parsed.name === "propose_action" &&
                  parsed.success &&
                  parsed.data &&
                  (parsed.data as Record<string, unknown>).pendingAction;
                const paData = isProposeAction
                  ? (parsed.data as Record<string, unknown>)
                  : undefined;

                toolCalls = toolCalls.map((tc) => {
                  if (!matched && tc.name === (parsed.name as string) && tc.status === "calling") {
                    matched = true;
                    return {
                      ...tc,
                      status: parsed.success ? ("success" as const) : ("error" as const),
                      summary: parsed.summary as string,
                      ...(paData
                        ? {
                            pendingAction: {
                              actionId: paData.actionId as string,
                              type: paData.actionType as string,
                              args: (paData.args || {}) as Record<string, unknown>,
                              summary: paData.summary as string,
                            },
                          }
                        : {}),
                    };
                  }
                  return tc;
                });

                // Extract card data from tool results
                const resultData = parsed.data as Record<string, unknown> | undefined;
                if (resultData?.cards) {
                  const newCards = resultData.cards as CardData[];
                  cards = [...cards, ...newCards];
                }
                // Single card (from workflows, batch actions, etc.)
                if (resultData?.card && typeof resultData.card === "object" && "type" in (resultData.card as object)) {
                  cards = [...cards, resultData.card as CardData];
                }

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accumulated, toolCalls: [...toolCalls], cards: [...cards] }
                      : m
                  )
                );

                // Detect pending action proposals
                if (
                  parsed.name === "propose_action" &&
                  parsed.success &&
                  parsed.data &&
                  (parsed.data as Record<string, unknown>).pendingAction
                ) {
                  onPendingActionRef.current?.(parsed.data as Record<string, unknown>);
                }
              }
            }
          }
        }

        // Process any remaining buffer content
        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6);
          if (data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accumulated, toolCalls: [...toolCalls], cards: [...cards] }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          const isRetryable = (error as Error & { retryable?: boolean }).retryable;
          const errorContent = isRetryable
            ? "The AI service is temporarily busy. Please try again in a moment."
            : (error as Error).message || "Sorry, something went wrong. Try again!";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: errorContent }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [user]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  // Abort active SSE stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const clearMessages = useCallback(() => {
    // Read from refs to avoid stale closure — clearMessages was closing over
    // messages/activeSessionId state, meaning rapid calls or calls during
    // streaming would capture outdated values.
    const currentMessages = messagesRef.current;
    const currentSessionId = activeSessionIdRef.current;

    if (currentMessages.length > 0) {
      setSessions((prev) => {
        const newSession: ChatSession = {
          id: currentSessionId,
          messages: currentMessages,
          createdAt: currentMessages[0]?.timestamp ?? Date.now(),
        };
        const updated = [newSession, ...prev.filter((s) => s.id !== currentSessionId)].slice(0, MAX_SESSIONS);
        try { sessionStorage.setItem(sessionsKey(userIdRef.current), JSON.stringify(updated)); } catch { /* quota */ }
        return updated;
      });
    }
    setMessages([]);
    setActiveSessionId(typeof window !== "undefined" ? crypto.randomUUID() : "default");
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (session) {
      setMessages(session.messages);
      setActiveSessionId(session.id);
    }
  }, []);

  const fetchBriefing = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/ai/briefing", {
        method: "POST",
        credentials: "include",
        signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.data?.briefing) {
        const briefingMsg: AIChatMessage = {
          id: `briefing-${Date.now()}`,
          role: "assistant",
          content: data.data.briefing,
          timestamp: Date.now(),
        };
        // Deduplicate: only prepend if no briefing message already exists
        setMessages((prev) => {
          if (prev.some((m) => m.id.startsWith("briefing-"))) return prev;
          return [briefingMsg, ...prev];
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Silent fail — briefing is best-effort
    }
  }, []);

  // Fetch briefing on mount and every 15 minutes (skip when tab is hidden)
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetchBriefing(controller.signal);

    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetchBriefing(controller.signal);
    }, 15 * 60 * 1000);

    // Re-fetch when tab becomes visible after being hidden
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchBriefing(controller.signal);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user, fetchBriefing]);

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages, setOnPendingAction, fetchBriefing, sessions, activeSessionId, switchSession };
}

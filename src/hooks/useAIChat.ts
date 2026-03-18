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
    actionType: string;
    actionArgs: Record<string, unknown>;
    actionSummary: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  cards?: CardData[];
}

const STORAGE_KEY = "yoodle-ai-chat-messages";
const SESSIONS_KEY = "ai-chat-sessions";
const MAX_SESSIONS = 3;

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  label?: string;
  createdAt: number;
}

function loadPersistedMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // Only keep messages from the last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return parsed.filter((m) => m.timestamp > cutoff);
  } catch {
    return [];
  }
}

function persistMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function useAIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(loadPersistedMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const isStreamingRef = useRef(false);

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = sessionStorage.getItem(SESSIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    typeof window !== "undefined" ? crypto.randomUUID() : "default"
  );

  // Pending action detection callback
  const onPendingActionRef = useRef<((data: Record<string, unknown>) => void) | null>(null);

  const setOnPendingAction = useCallback((cb: (data: Record<string, unknown>) => void) => {
    onPendingActionRef.current = cb;
  }, []);

  // Keep refs in sync with state + persist to sessionStorage
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

  // Persist messages whenever they change (skip during streaming for perf)
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      persistMessages(messages);
    }
  }, [messages, isStreaming]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !content.trim() || isStreamingRef.current) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
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
                // Throw to the outer catch so it displays an error message
                throw new Error(parsed.error as string);
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
                              actionType: paData.actionType as string,
                              actionArgs: (paData.args || {}) as Record<string, unknown>,
                              actionSummary: paData.summary as string,
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
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: "Sorry, something went wrong. Try again!" }
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
    if (messages.length > 0) {
      setSessions((prev) => {
        const newSession: ChatSession = {
          id: activeSessionId,
          messages,
          createdAt: messages[0]?.timestamp ?? Date.now(),
        };
        const updated = [newSession, ...prev.filter((s) => s.id !== activeSessionId)].slice(0, MAX_SESSIONS);
        try { sessionStorage.setItem(SESSIONS_KEY, JSON.stringify(updated)); } catch { /* quota */ }
        return updated;
      });
    }
    setMessages([]);
    setActiveSessionId(typeof window !== "undefined" ? crypto.randomUUID() : "default");
  }, [messages, activeSessionId]);

  const switchSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setMessages(session.messages);
      setActiveSessionId(session.id);
    }
  }, [sessions]);

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
        const briefingMsg: ChatMessage = {
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

  // Fetch briefing on mount and every 15 minutes
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetchBriefing(controller.signal);
    const interval = setInterval(() => fetchBriefing(controller.signal), 15 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [user, fetchBriefing]);

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages, setOnPendingAction, fetchBriefing, sessions, activeSessionId, switchSession };
}

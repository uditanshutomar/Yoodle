"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "./useAuth";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "calling" | "success" | "error";
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export function useAIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const isStreamingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

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
            history: messagesRef.current
              .filter((m) => m.content.trim() !== "")
              .map((m) => ({
                role: m.role,
                content: m.content,
              })),
            context: {
              name: user.displayName || user.name || undefined,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(errorData?.message || `AI request failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream reader");

        const decoder = new TextDecoder();
        let accumulated = "";
        let toolCalls: ToolCall[] = [];
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

              try {
                const parsed = JSON.parse(data);

                if (parsed.error) {
                  // Server-side error (Gemini failure, missing config, etc.)
                  throw new Error(parsed.error);
                } else if (parsed.text) {
                  // Text chunk — append to message content
                  accumulated += parsed.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: accumulated, toolCalls: [...toolCalls] }
                        : m
                    )
                  );
                } else if (parsed.type === "tool_call") {
                  // Tool is being called — add a pending indicator
                  const tc: ToolCall = {
                    id: `tc-${Date.now()}-${parsed.name}`,
                    name: parsed.name,
                    args: parsed.args || {},
                    status: "calling",
                  };
                  toolCalls = [...toolCalls, tc];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: accumulated, toolCalls: [...toolCalls] }
                        : m
                    )
                  );
                } else if (parsed.type === "tool_result") {
                  // Tool finished — update the last matching tool call
                  toolCalls = toolCalls.map((tc) =>
                    tc.name === parsed.name && tc.status === "calling"
                      ? {
                          ...tc,
                          status: parsed.success ? ("success" as const) : ("error" as const),
                          summary: parsed.summary,
                        }
                      : tc
                  );
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: accumulated, toolCalls: [...toolCalls] }
                        : m
                    )
                  );
                }
              } catch {
                // Skip malformed JSON
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
                      ? { ...m, content: accumulated, toolCalls: [...toolCalls] }
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

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages };
}

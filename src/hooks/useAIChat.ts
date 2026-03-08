"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function useAIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !content.trim() || isStreaming) return;

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
            history: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("Failed to get AI response");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream reader");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  accumulated += parsed.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: accumulated }
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
    [user, messages, isStreaming]
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

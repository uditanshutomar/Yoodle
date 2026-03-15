"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Square, Trash2, Bot } from "lucide-react";
import ChatBubble from "./ChatBubble";
import type { ChatMessage } from "@/hooks/useAIChat";

interface ChatWindowProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  onClear: () => void;
}

export default function ChatWindow({
  messages,
  isStreaming,
  onSend,
  onStop,
  onClear,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b-2 border-[var(--border)] bg-[#FFE600]/10">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]"
          >
            <Bot size={16} className="text-[#0A0A0A]" />
          </motion.div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              Doodle Poodle
            </h3>
            <p className="text-[10px] text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
              {isStreaming ? "Typing…" : "Your AI meeting buddy"}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-4xl mb-4"
            >
              🐩
            </motion.div>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
              Hey there!
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs" style={{ fontFamily: "var(--font-body)" }}>
              I&apos;m Doodle Poodle, your AI meeting buddy. Ask me to prep for meetings, summarize notes, or just chat!
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            isStreaming={isStreaming && msg.role === "assistant" && msg === messages[messages.length - 1]}
            toolCalls={msg.toolCalls}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t-2 border-[var(--border)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Doodle Poodle anything…"
            disabled={isStreaming}
            className="flex-1 px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] focus:border-[#FFE600] focus:outline-none transition-colors disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500 text-white border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#FFE600] text-[#0A0A0A] border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

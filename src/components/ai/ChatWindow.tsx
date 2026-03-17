"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Square, Trash2, X } from "lucide-react";
import Image from "next/image";
import ChatBubble from "./ChatBubble";
import SuggestionChips from "./SuggestionChips";
import SmartEmptyState from "./SmartEmptyState";
import InsightQueue, { type InsightItem } from "./InsightQueue";
import VoiceInputButton from "@/components/chat/VoiceInputButton";
import { useAuth } from "@/hooks/useAuth";
import type { ChatMessage } from "@/hooks/useAIChat";

const MASCOT_BY_MODE: Record<string, string> = {
  social: "/mascot-social.png",
  lockin: "/mascot-lockin.png",
  invisible: "/mascot-invisible.png",
};

interface ChatWindowProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  onClear: () => void;
  onClose?: () => void;
}

export default function ChatWindow({
  messages,
  isStreaming,
  onSend,
  onStop,
  onClear,
  onClose,
}: ChatWindowProps) {
  const { user } = useAuth();
  const mascotSrc = MASCOT_BY_MODE[user?.mode || "social"] || MASCOT_BY_MODE.social;
  const [input, setInput] = useState("");
  const [voiceInterim, setVoiceInterim] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
  };

  const handleVoiceTranscript = (text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    setVoiceInterim("");
  };

  const [insights, setInsights] = useState<InsightItem[]>([]);
  const handleInsightDismiss = (id: string) => setInsights((prev) => prev.filter((i) => i.id !== id));
  const handleInsightAction = (prompt: string) => onSend(prompt);

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b-2 border-[var(--border)] bg-[#FFE600]/10">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]"
          >
            <Image src={mascotSrc} alt="Yoodle" width={20} height={20} className="mix-blend-multiply" />
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
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              onClick={onClear}
              className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors"
              title="Clear chat"
            >
              <Trash2 size={14} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              title="Close (⌘J)"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <InsightQueue
        insights={insights}
        onAction={handleInsightAction}
        onDismiss={handleInsightDismiss}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <SmartEmptyState onSend={onSend} />
        )}

        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            id={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            isStreaming={isStreaming && msg.role === "assistant" && msg === messages[messages.length - 1]}
            toolCalls={msg.toolCalls}
            cards={msg.cards}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t-2 border-[var(--border)]">
        {!isStreaming && messages.length > 0 && (
          <div className="mb-2">
            <SuggestionChips onSelect={onSend} />
          </div>
        )}
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
          <VoiceInputButton
            onTranscript={handleVoiceTranscript}
            onInterim={setVoiceInterim}
            onRecordingEnd={() => setVoiceInterim("")}
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
        {voiceInterim && (
          <p
            className="text-[10px] text-[var(--text-muted)] mt-1 italic truncate px-4"
            style={{ fontFamily: "var(--font-body)" }}
          >
            🎙️ {voiceInterim}
          </p>
        )}
      </div>
    </div>
  );
}

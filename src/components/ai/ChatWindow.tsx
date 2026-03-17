"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Square, Trash2, X } from "lucide-react";
import Image from "next/image";
import ChatBubble from "./ChatBubble";
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <p className="text-xs text-[var(--text-muted)] mb-4" style={{ fontFamily: "var(--font-body)" }}>
              Try one of these to get started:
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {[
                { label: "Summarize my day", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
                { label: "Prep for meeting", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
                { label: "Draft follow-up", icon: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" },
                { label: "What's pending?", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => onSend(item.label)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[#FFE600] hover:bg-[#FFE600]/10 transition-colors group text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)] group-hover:text-[#B8860B] transition-colors flex-shrink-0">
                    <path d={item.icon} />
                  </svg>
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" style={{ fontFamily: "var(--font-body)" }}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
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

"use client";

import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  isStreaming?: boolean;
}

export default function ChatBubble({ role, content, timestamp, isStreaming }: ChatBubbleProps) {
  const isAssistant = role === "assistant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
          isAssistant
            ? "bg-[#FFE600] border-[var(--border-strong)]"
            : "bg-[var(--foreground)] border-[var(--border-strong)]"
        }`}
      >
        {isAssistant ? (
          <Bot size={14} className="text-[#0A0A0A]" />
        ) : (
          <User size={14} className="text-white" />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] ${isAssistant ? "" : "text-right"}`}>
        <div
          className={`inline-block px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAssistant
              ? "bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-tl-md"
              : "bg-[#FFE600] text-[#0A0A0A] border-2 border-[var(--border-strong)] rounded-tr-md"
          }`}
          style={{ fontFamily: "var(--font-body)" }}
        >
          {content || (isStreaming && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              Thinking…
            </motion.span>
          ))}
        </div>
        {timestamp && (
          <p className={`text-[9px] text-[var(--text-muted)] mt-1 ${isAssistant ? "" : "text-right"}`}>
            {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </motion.div>
  );
}

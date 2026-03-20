"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Ghost } from "lucide-react";

interface GhostChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: "text" | "system";
}

interface GhostChatProps {
  messages: GhostChatMessage[];
  currentUserId: string;
  onSend: (message: string) => void;
}

export default function GhostChat({ messages, currentUserId, onSend }: GhostChatProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border-2 border-[#7C3AED] rounded-2xl shadow-[4px_4px_0_#7C3AED] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-[#7C3AED]/20 bg-[#7C3AED]/5">
        <Ghost size={16} className="text-[#7C3AED]" />
        <span className="text-sm font-bold text-[var(--text-primary)] font-heading">
          Ghost Chat
        </span>
        <span className="text-[10px] text-[var(--text-secondary)] ml-auto font-body">
          vanishes when room ends
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.type === "system") {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <span className="text-[10px] text-[var(--text-secondary)] px-3 py-1 bg-[var(--surface-hover)] rounded-full font-body">
                    {msg.content}
                  </span>
                </motion.div>
              );
            }

            const isOwn = msg.senderId === currentUserId;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                  {!isOwn && (
                    <span className="text-[10px] text-[var(--text-secondary)] ml-1 mb-0.5 block font-body">
                      {msg.senderName}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm ${
                      isOwn
                        ? "bg-[#7C3AED] text-white rounded-br-md"
                        : "bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md"
                    } font-body`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[9px] text-[var(--text-muted)] mt-0.5 block px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t-2 border-[#7C3AED]/20">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a ghost message…"
            className="flex-1 px-3 py-2 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] focus:border-[#7C3AED] focus:outline-none transition-colors font-body"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#7C3AED] text-white border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

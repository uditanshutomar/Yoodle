"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: "text" | "system" | "reaction";
}

interface MeetingChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  currentUserId: string;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getNameColor(name: string): string {
  const colors = ["#FF6B6B", "#06B6D4", "#8B5CF6", "#F97316", "#22C55E"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function MeetingChat({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId,
}: MeetingChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="w-80 h-full flex flex-col bg-white/95 backdrop-blur-sm border-l-2 border-[#0A0A0A]"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#0A0A0A]/10">
            <div className="flex items-center gap-2">
              <h3
                className="text-base font-bold text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Chat
              </h3>
              {/* Doodle squiggle decoration */}
              <svg
                width="20"
                height="8"
                viewBox="0 0 20 8"
                className="opacity-40"
              >
                <path
                  d="M2 4 Q5 1 8 4 Q11 7 14 4 Q17 1 20 4"
                  fill="none"
                  stroke="#FFE600"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <motion.button
              className="rounded-lg p-1.5 text-[#0A0A0A]/60 hover:text-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors cursor-pointer"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p
                  className="text-sm text-[#0A0A0A]/40"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  No messages yet. Say hi!
                </p>
                <span className="text-2xl mt-2">👋</span>
              </div>
            )}
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {msg.type === "system" ? (
                  <div className="text-center">
                    <span
                      className="text-xs text-[#0A0A0A]/40 italic"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {msg.content}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`flex flex-col ${
                      msg.senderId === currentUserId
                        ? "items-end"
                        : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="text-xs font-bold"
                        style={{
                          fontFamily: "var(--font-heading)",
                          color:
                            msg.senderId === currentUserId
                              ? "#0A0A0A"
                              : getNameColor(msg.senderName),
                        }}
                      >
                        {msg.senderId === currentUserId
                          ? "You"
                          : msg.senderName}
                      </span>
                      <span
                        className="text-[10px] text-[#0A0A0A]/30"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      className={`rounded-2xl px-3 py-2 max-w-[90%] text-sm ${
                        msg.senderId === currentUserId
                          ? "bg-[#FFE600] text-[#0A0A0A] rounded-br-sm border-2 border-[#0A0A0A]"
                          : "bg-[#0A0A0A]/5 text-[#0A0A0A] rounded-bl-sm"
                      }`}
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t-2 border-[#0A0A0A]/10">
            <div className="flex items-center gap-2 rounded-xl bg-[#0A0A0A]/5 px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 bg-transparent text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none"
                style={{ fontFamily: "var(--font-body)" }}
              />
              <motion.button
                className={`rounded-full p-1.5 cursor-pointer transition-colors ${
                  input.trim()
                    ? "bg-[#FFE600] text-[#0A0A0A] border-2 border-[#0A0A0A]"
                    : "text-[#0A0A0A]/20"
                }`}
                whileHover={input.trim() ? { scale: 1.1 } : {}}
                whileTap={input.trim() ? { scale: 0.9 } : {}}
                onClick={handleSend}
                disabled={!input.trim()}
              >
                <Send size={14} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

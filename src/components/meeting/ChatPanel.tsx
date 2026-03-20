"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/hooks/useChat";
import VoiceInputButton from "@/components/chat/VoiceInputButton";

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    messages: ChatMessage[];
    onSendMessage: (content: string) => void;
    currentUserId: string;
}

// Generate a consistent color from a name
function getInitialColor(name: string): string {
    const colors = ["#FFE600", "#FF6B6B", "#7C3AED", "#06B6D4", "#22C55E", "#F59E0B", "#EC4899", "#3B82F6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

export default function ChatPanel({ isOpen, onClose, messages, onSendMessage, currentUserId }: ChatPanelProps) {
    const [message, setMessage] = useState("");
    const [voiceInterim, setVoiceInterim] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    useEffect(() => {
        if (isOpen) {
            const t = setTimeout(() => inputRef.current?.focus(), 100);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    const handleSend = () => {
        if (!message.trim()) return;
        onSendMessage(message.trim());
        setMessage("");
    };

    const handleVoiceTranscript = (text: string) => {
        setMessage((prev) => (prev ? `${prev} ${text}` : text));
        setVoiceInterim("");
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: 380, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 380, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 28 }}
                    className="chat-panel absolute right-0 top-0 bottom-0 z-30 flex w-full sm:w-[340px] flex-col"
                    role="complementary"
                    aria-label="Meeting chat"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-5 py-4">
                        <h3
                            className="text-sm font-bold text-[var(--text-primary)] tracking-wide font-heading"
                        >
                            💬 Chat
                        </h3>
                        <motion.button
                            whileHover={{ scale: 1.1, rotate: 90 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={onClose}
                            aria-label="Close chat"
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-primary)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </motion.button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="chat-messages flex-1 overflow-y-auto px-4 py-3 space-y-4" role="log" aria-live="polite">
                        {messages.length === 0 && (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-sm text-[var(--text-muted)] text-center">
                                    No messages yet.<br />Be the first to say something! 💬
                                </p>
                            </div>
                        )}
                        {messages.map((msg) => {
                            const isMe = msg.senderId === currentUserId;
                            const safeName = msg.senderName || "?";
                            const color = getInitialColor(safeName);
                            const initial = safeName.charAt(0).toUpperCase();

                            return (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex gap-2.5"
                                >
                                    {/* Avatar circle with initial */}
                                    <div
                                        className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full border-2 border-[var(--border-strong)] flex items-center justify-center"
                                        style={{ backgroundColor: color }}
                                    >
                                        <span className="text-[10px] font-bold text-[#0A0A0A] font-heading">
                                            {initial}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-xs font-bold text-[var(--text-primary)] font-heading">
                                                {isMe ? "You" : msg.senderName}
                                            </span>
                                            <span className="text-[10px] text-[var(--text-muted)]">
                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-sm text-[var(--text-secondary)] leading-relaxed">{msg.content}</p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Input */}
                    <div className="border-t-2 border-[var(--border-strong)] px-4 py-3">
                        <div className="flex items-center gap-2 rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 shadow-[3px_3px_0_var(--border-strong)]">
                            <input
                                ref={inputRef}
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                placeholder="Type a message..."
                                aria-label="Type a chat message"
                                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] font-body"
                            />
                            <VoiceInputButton
                                onTranscript={handleVoiceTranscript}
                                onInterim={setVoiceInterim}
                                onRecordingEnd={() => setVoiceInterim("")}
                                className="!p-1"
                            />
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={handleSend}
                                aria-label="Send message"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:outline-none"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            </motion.button>
                        </div>
                        {voiceInterim && (
                            <p className="text-[10px] text-[var(--text-muted)] mt-1 italic truncate px-1">
                                🎙️ {voiceInterim}
                            </p>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

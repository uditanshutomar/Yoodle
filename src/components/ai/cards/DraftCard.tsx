"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Copy, X, Check } from "lucide-react";
import type { DraftCardData } from "./types";

interface DraftCardProps {
  data: DraftCardData;
  onSend?: (actionType: string, args: Record<string, unknown>) => void;
  onPolish?: (content: string) => void;
}

type CardState = "editing" | "sending" | "sent" | "discarded";

export default function DraftCard({ data, onSend, onPolish }: DraftCardProps) {
  const [state, setState] = useState<CardState>("editing");
  const [content, setContent] = useState(data.content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    setState("sending");
    try {
      onSend?.(data.actionType, { ...data.actionArgs, content });
      setState("sent");
    } catch {
      setState("editing");
    }
  };

  const handlePolish = () => {
    onPolish?.(content);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDiscard = () => {
    setState("discarded");
  };

  if (state === "discarded") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-3 mt-1"
    >
      <AnimatePresence mode="wait">
        {state === "sent" ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 py-1 text-[11px] text-green-500 font-semibold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Check size={14} /> Sent
          </motion.div>
        ) : state === "sending" ? (
          <motion.div
            key="sending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-1 text-[11px] text-[var(--text-muted)]"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Send size={12} />
            </motion.div>
            Sending...
          </motion.div>
        ) : (
          <motion.div key="editing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Recipient header */}
            {data.recipient && (
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  To:
                </span>
                <span
                  className="text-[11px] font-semibold text-[var(--text-secondary)]"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {data.recipient}
                </span>
              </div>
            )}

            {/* Editable textarea */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-[var(--border-default)] bg-[var(--surface-hover)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#FFE600]/50 transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            />

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2.5">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSend}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold py-1.5 px-3 border-2 border-green-600 shadow-[2px_2px_0_#166534] hover:shadow-[1px_1px_0_#166534] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Send size={12} /> Send
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handlePolish}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#FFE600]/20 text-[#B8A200] text-[11px] font-bold py-1.5 px-3 border-2 border-[#FFE600]/40 hover:bg-[#FFE600]/30 transition-all"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Sparkles size={12} /> Polish
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleCopy}
                className="flex items-center justify-center rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] p-1.5 border-2 border-[var(--border-default)] hover:bg-[var(--surface-elevated)] transition-all"
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleDiscard}
                className="flex items-center justify-center rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] p-1.5 border-2 border-[var(--border-default)] hover:bg-[var(--surface-elevated)] transition-all"
              >
                <X size={12} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

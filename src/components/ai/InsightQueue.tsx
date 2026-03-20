"use client";

import { X, Clock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export interface InsightItem {
  id: string;
  emoji: string;
  text: string;
  prompt: string;
  snoozable?: boolean;
}

interface InsightQueueProps {
  insights: InsightItem[];
  onAction: (prompt: string) => void;
  onDismiss: (id: string) => void;
  onSnooze?: (id: string) => void;
}

export default function InsightQueue({ insights, onAction, onDismiss, onSnooze }: InsightQueueProps) {
  if (insights.length === 0) return null;

  return (
    <div className="px-5 pt-3 space-y-2">
      <p
        className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] font-heading"
      >
        Insights ({insights.length})
      </p>
      <AnimatePresence>
        {insights.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]"
          >
            <span className="text-sm mt-0.5">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[var(--text-primary)] leading-snug font-body">
                {item.text}
              </p>
              <button
                onClick={() => onAction(item.prompt)}
                aria-label={`Ask about: ${item.text}`}
                className="mt-1 text-[10px] font-semibold text-[#B8A200] hover:text-[#FFE600] transition-colors rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
              >
                Tell me more →
              </button>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.snoozable && onSnooze && (
                <button
                  onClick={() => onSnooze(item.id)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                  title="Snooze 2h"
                  aria-label={`Snooze "${item.text}" for 2 hours`}
                >
                  <Clock size={12} aria-hidden="true" />
                </button>
              )}
              <button
                onClick={() => onDismiss(item.id)}
                className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                title="Dismiss"
                aria-label={`Dismiss "${item.text}"`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

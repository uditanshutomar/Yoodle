"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronUp } from "lucide-react";
import { MASCOT_BY_MODE } from "@/components/ai/constants";
import type { UserMode } from "@/hooks/useUserMode";

const MODES: { key: UserMode; label: string; emoji: string; description: string }[] = [
  { key: "invisible", label: "Ninja", emoji: "\u{1F977}", description: "Nobody can see you" },
  { key: "lockin", label: "LockedIn", emoji: "\u{1F3A7}", description: "Only workspace mates" },
  { key: "social", label: "Social", emoji: "\u{1F9CB}", description: "Everyone on Yoodle" },
];

interface ModeSwitcherProps {
  mode: UserMode;
  onModeChange: (mode: UserMode) => void;
  status?: string;
  onStatusChange?: (status: string) => void;
}

export default function ModeSwitcher({
  mode,
  onModeChange,
  status,
  onStatusChange,
}: ModeSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState(status || "");

  const handleModeClick = useCallback(
    (newMode: UserMode) => {
      if (newMode !== mode) onModeChange(newMode);
    },
    [mode, onModeChange],
  );

  const handleStatusSave = useCallback(() => {
    setEditingStatus(false);
    if (onStatusChange && statusDraft !== status) {
      onStatusChange(statusDraft);
    }
  }, [onStatusChange, statusDraft, status]);

  // Collapsed: just show current mode mascot as floating button
  if (!expanded) {
    return (
      <motion.button
        onClick={() => setExpanded(true)}
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[#FFE600] shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-shadow cursor-pointer"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={`Mode: ${MODES.find((m) => m.key === mode)?.label}`}
      >
        <Image
          src={MASCOT_BY_MODE[mode]}
          alt={MODES.find((m) => m.key === mode)?.label || "Mode"}
          width={40}
          height={40}
          className="mix-blend-multiply"
        />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden"
      style={{ width: 320 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[var(--border)]">
        <span className="text-sm font-bold text-[var(--text-primary)] font-heading">
          {"\u{1F512}"} Your Visibility
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        >
          <ChevronUp size={14} className="text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Mode cards */}
      <div className="flex gap-2 p-3">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <motion.button
              key={m.key}
              onClick={() => handleModeClick(m.key)}
              className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all cursor-pointer ${
                active
                  ? "border-[var(--border-strong)] bg-[#FFE600] shadow-[3px_3px_0_var(--border-strong)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
              }`}
              animate={active ? { scale: 1.03 } : { scale: 1 }}
              whileTap={{ scale: 0.97 }}
            >
              <motion.div
                animate={active ? { y: [0, -4, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <Image
                  src={MASCOT_BY_MODE[m.key]}
                  alt={m.label}
                  width={48}
                  height={48}
                  className="mix-blend-multiply"
                />
              </motion.div>
              <span
                className={`text-xs font-bold font-heading ${
                  active ? "text-[#0A0A0A]" : "text-[var(--text-secondary)]"
                }`}
              >
                {m.label}
              </span>
              <span
                className={`text-[10px] font-body leading-tight text-center ${
                  active ? "text-[#0A0A0A]/70" : "text-[var(--text-muted)]"
                }`}
              >
                {m.description}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Status editor -- hidden in Ninja mode */}
      <AnimatePresence>
        {mode !== "invisible" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              {editingStatus ? (
                <input
                  type="text"
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value.slice(0, 60))}
                  onBlur={handleStatusSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleStatusSave();
                    if (e.key === "Escape") { setEditingStatus(false); setStatusDraft(status || ""); }
                  }}
                  placeholder="What are you up to?"
                  maxLength={60}
                  autoFocus
                  className="w-full rounded-lg border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                />
              ) : (
                <button
                  onClick={() => { setStatusDraft(status || ""); setEditingStatus(true); }}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-body"
                >
                  {"\u{1F4AC}"} {status || "Set a status..."} {"\u270F\uFE0F"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Check, X, Loader2 } from "lucide-react";
import type { DiffPreviewCardData } from "./types";

interface DiffPreviewCardProps {
  data: DiffPreviewCardData;
  onConfirm?: (actionType: string, args: Record<string, unknown>) => void | Promise<void>;
  onDeny?: () => void;
}

type CardState = "preview" | "confirming" | "confirmed" | "denied";

export default function DiffPreviewCard({ data, onConfirm, onDeny }: DiffPreviewCardProps) {
  const [state, setState] = useState<CardState>("preview");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (state === "confirming") return; // prevent double-fire
    setError(null);
    setState("confirming");
    try {
      await onConfirm?.(data.actionType, data.actionArgs);
      setState("confirmed");
    } catch (err) {
      console.error("[DiffPreviewCard] Confirmation failed:", err);
      setError("Confirmation failed. Try again.");
      setState("preview");
    }
  };

  const handleDeny = () => {
    onDeny?.();
    setState("denied");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border-default)] bg-[var(--surface-elevated)] px-3.5 py-2.5 mt-1"
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFE600]/20 border border-[#FFE600]/40">
          <Eye size={14} className="text-[#B8A200]" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold text-[var(--text-primary)] leading-snug"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {data.actionSummary}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 capitalize">
            {data.actionType.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {/* Field list */}
      {data.fields.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {data.fields.map((field, i) => (
            <div
              key={i}
              className="flex items-baseline gap-2 px-2 py-1 rounded-md bg-[var(--surface-hover)]"
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] shrink-0"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {field.label}:
              </span>
              <span
                className="text-[11px] text-[var(--text-primary)] truncate"
                style={{ fontFamily: "var(--font-body)" }}
                title={field.value}
              >
                {field.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons / status */}
      {error && <p className="text-xs text-[#FF6B6B] mt-1">{error}</p>}
      <AnimatePresence mode="wait">
        {state === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 mt-2.5"
          >
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold py-1.5 px-3 border-2 border-green-600 shadow-[2px_2px_0_#166534] hover:shadow-[1px_1px_0_#166534] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <Check size={12} /> Confirm
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDeny}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] text-[11px] font-bold py-1.5 px-3 border-2 border-[var(--border-default)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <X size={12} /> Cancel
            </motion.button>
          </motion.div>
        )}

        {state === "confirming" && (
          <motion.div
            key="confirming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mt-2.5 text-[11px] text-[var(--text-muted)]"
          >
            <Loader2 size={12} className="animate-spin" /> Executing...
          </motion.div>
        )}

        {state === "confirmed" && (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mt-2.5 text-[11px] text-green-500 font-semibold"
          >
            <Check size={12} /> Done
          </motion.div>
        )}

        {state === "denied" && (
          <motion.div
            key="denied"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mt-2.5 text-[11px] text-[var(--text-muted)]"
          >
            <X size={12} /> Cancelled
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

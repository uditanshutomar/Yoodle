"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, SkipForward, AlertCircle } from "lucide-react";
import type { WorkflowProgressCardData } from "./types";

const STATUS_ICON = {
  pending: <Circle size={14} className="text-[var(--text-muted)]" />,
  in_progress: <Loader2 size={14} className="text-[#FFE600] animate-spin" />,
  done: <CheckCircle2 size={14} className="text-emerald-500" />,
  skipped: <SkipForward size={14} className="text-[var(--text-muted)]" />,
  error: <AlertCircle size={14} className="text-red-500" />,
};

interface Props {
  data: WorkflowProgressCardData;
  onCancel?: () => void;
}

export default function WorkflowProgressCard({ data, onCancel }: Props) {
  const doneCount = data.steps.filter((s) => s.status === "done").length;
  const total = data.steps.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-3 shadow-[2px_2px_0_var(--border-strong)]"
    >
      <div className="flex items-center justify-between mb-2">
        <h4
          className="text-xs font-bold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {data.title}
        </h4>
        <span className="text-[10px] font-medium text-[var(--text-muted)]">
          {doneCount}/{total} steps
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-[var(--surface-hover)] mb-3 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[#FFE600]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="space-y-1.5">
        {data.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            {STATUS_ICON[step.status]}
            <span
              className={`text-[11px] ${
                step.status === "in_progress"
                  ? "font-semibold text-[var(--text-primary)]"
                  : step.status === "done"
                    ? "text-[var(--text-secondary)] line-through"
                    : step.status === "error"
                      ? "text-red-400"
                      : "text-[var(--text-muted)]"
              }`}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-2 text-[10px] text-red-400 hover:text-red-500 transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Cancel workflow
        </button>
      )}
    </motion.div>
  );
}

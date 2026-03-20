"use client";

import { useState } from "react";
import { Zap, Check, SkipForward, AlertCircle, Undo2, Loader2 } from "lucide-react";
import type { MeetingCascadeCardData } from "./types";

interface Props {
  data: MeetingCascadeCardData;
  onUndo?: (undoToken: string) => void | Promise<void>;
}

function StatusIcon({ status }: { status: "done" | "skipped" | "error" }) {
  switch (status) {
    case "done":
      return <Check size={14} className="text-emerald-500 shrink-0" />;
    case "skipped":
      return <SkipForward size={14} className="text-[var(--text-muted)] shrink-0" />;
    case "error":
      return <AlertCircle size={14} className="text-red-500 shrink-0" />;
  }
}

export default function MeetingCascadeCard({ data, onUndo }: Props) {
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undone, setUndone] = useState<Set<string>>(new Set());

  const doneCount = data.steps.filter((s) => s.status === "done").length;

  const handleUndo = async (token: string) => {
    if (undoing) return; // prevent concurrent undos
    setUndoing(token);
    try {
      await onUndo?.(token);
      setUndone((prev) => new Set(prev).add(token));
    } catch (err) {
      console.error("[MeetingCascadeCard] Undo failed:", err);
    } finally {
      setUndoing(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-[var(--text-muted)]" />
          <h4
            className="text-xs font-bold text-[var(--text-primary)] font-heading"
          >
            Post-Meeting Actions: {data.meetingTitle}
          </h4>
        </div>
        <span className="text-[10px] font-medium text-[var(--text-muted)]">
          {doneCount}/{data.steps.length} done
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        {data.steps.map((step) => {
          const isUndone = step.undoToken ? undone.has(step.undoToken) : false;
          const isUndoing = step.undoToken ? undoing === step.undoToken : false;

          return (
            <div
              key={step.step}
              className={`flex items-start gap-2 ${isUndone ? "opacity-50" : ""}`}
            >
              <StatusIcon status={step.status} />
              <div className="flex-1 min-w-0">
                <span
                  className={`text-[11px] text-[var(--text-primary)] ${isUndone ? "line-through" : ""} font-body`}
                >
                  {step.step}
                </span>
                <p className="text-[10px] text-[var(--text-muted)]">{step.summary}</p>
              </div>
              {step.undoToken && step.status === "done" && !isUndone && (
                <button
                  onClick={() => handleUndo(step.undoToken!)}
                  disabled={isUndoing}
                  className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0"
                >
                  {isUndoing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Undo2 size={12} />
                  )}
                  Undo
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

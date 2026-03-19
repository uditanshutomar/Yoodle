"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Square, Loader2, Check } from "lucide-react";
import type { BatchActionCardData } from "./types";

interface Props {
  data: BatchActionCardData;
  onConfirm?: (selectedIds: string[], actionType: string, items: BatchActionCardData["items"]) => void | Promise<void>;
}

export default function BatchActionCard({ data, onConfirm }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(data.items.map((i) => i.id)),
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((i) => i.id)));
    }
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0 || isConfirming) return;
    setError(null);
    setIsConfirming(true);
    try {
      const selected = data.items.filter((i) => selectedIds.has(i.id));
      await onConfirm?.(Array.from(selectedIds), data.actionType, selected);
      setIsConfirmed(true);
    } catch (err) {
      console.error("[BatchActionCard] Confirmation failed:", err);
      setError("Batch action failed. Try again.");
      setIsConfirming(false);
    }
  };

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
          {data.actionLabel}
        </h4>
        <button
          onClick={toggleAll}
          className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {selectedIds.size === data.items.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {data.items.map((item) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                isSelected
                  ? "bg-[#FFE600]/10 border border-[#FFE600]/20"
                  : "hover:bg-[var(--surface-hover)]"
              }`}
            >
              {isSelected ? (
                <CheckSquare size={14} className="text-[#B8A200] shrink-0" />
              ) : (
                <Square size={14} className="text-[var(--text-muted)] shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[var(--text-primary)] truncate" style={{ fontFamily: "var(--font-body)" }}>
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="text-[9px] text-[var(--text-muted)] truncate" style={{ fontFamily: "var(--font-body)" }}>
                    {item.subtitle}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-[#FF6B6B] mt-1">{error}</p>}
      <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-[var(--border)]">
        {isConfirmed ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-500 ml-auto" style={{ fontFamily: "var(--font-heading)" }}>
            <Check size={14} /> Confirmed
          </span>
        ) : (
          <>
            <span className="text-[10px] text-[var(--text-muted)] mr-auto" style={{ fontFamily: "var(--font-body)" }}>
              {selectedIds.size} of {data.items.length} selected
            </span>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || isConfirming}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-[#FFE600] text-[#0A0A0A] border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40 disabled:shadow-none"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {isConfirming ? <Loader2 size={12} className="animate-spin" /> : null}
              Confirm
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

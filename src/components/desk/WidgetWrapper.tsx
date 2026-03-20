"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import type { WidgetMeta } from "./widget-registry";

interface WidgetWrapperProps {
  meta: WidgetMeta;
  children: ReactNode;
  editMode?: boolean;
  onRemove?: () => void;
}

export default function WidgetWrapper({
  meta,
  children,
  editMode,
  onRemove,
}: WidgetWrapperProps) {
  const Icon = meta.icon;

  return (
    <div className="flex h-full flex-col rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Icon
          size={16}
          className="flex-shrink-0 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <span
          className="text-sm font-bold text-[var(--text-primary)] flex-1 truncate font-heading"
        >
          {meta.title}
        </span>
        {editMode && onRemove && (
          <button
            onClick={onRemove}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[#FF6B6B]/20 hover:text-[#FF6B6B] transition-colors"
            aria-label={`Remove ${meta.title} widget`}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}

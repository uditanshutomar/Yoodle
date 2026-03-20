"use client";

import { Plus } from "lucide-react";
import { WIDGET_REGISTRY, ALL_WIDGET_IDS } from "./widget-registry";

interface WidgetCatalogProps {
  activeIds: string[];
  onAdd: (id: string) => void;
}

export default function WidgetCatalog({ activeIds, onAdd }: WidgetCatalogProps) {
  const available = ALL_WIDGET_IDS.filter((id) => !activeIds.includes(id));

  if (available.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-4">
      <p
        className="text-sm font-bold text-[var(--text-primary)] mb-3 font-heading"
      >
        Add widgets
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {available.map((id) => {
          const meta = WIDGET_REGISTRY[id];
          const Icon = meta.icon;

          return (
            <button
              key={id}
              onClick={() => onAdd(id)}
              className="group flex flex-col items-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-4 hover:border-[#FFE600] hover:shadow-[2px_2px_0_var(--border-strong)] transition-all text-center"
            >
              <Icon
                size={20}
                className="text-[var(--text-muted)] group-hover:text-[#FFE600] transition-colors"
                aria-hidden="true"
              />
              <span
                className="text-xs font-bold text-[var(--text-primary)] font-heading"
              >
                {meta.title}
              </span>
              <span
                className="text-[10px] text-[var(--text-muted)] leading-tight font-body"
              >
                {meta.description}
              </span>
              <Plus
                size={16}
                className="text-[var(--text-muted)] group-hover:text-[#FFE600] transition-colors"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

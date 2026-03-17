"use client";

import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import type { DataSummaryCardData } from "./types";

const COLOR_MAP: Record<string, string> = {
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  blue: "#3b82f6",
  purple: "#a855f7",
};

function resolveColor(color?: string): string {
  if (!color) return "#FFE600";
  return COLOR_MAP[color] ?? "#FFE600";
}

interface DataSummaryCardProps {
  data: DataSummaryCardData;
}

export default function DataSummaryCard({ data }: DataSummaryCardProps) {
  const numericValues = data.stats
    .map((s) => (typeof s.value === "number" ? s.value : 0))
    .filter((v) => v > 0);
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2.5"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#FFE600]/15 text-[#FFE600]">
          <BarChart3 size={12} />
        </div>
        <p
          className="text-xs font-medium leading-snug text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {data.title}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {data.stats.map((stat) => {
          const color = resolveColor(stat.color);
          const isNumeric = typeof stat.value === "number";
          const pct = isNumeric && maxValue > 0 ? ((stat.value as number) / maxValue) * 100 : 0;

          return (
            <div
              key={stat.label}
              className="rounded-lg bg-[var(--surface-hover)] px-2.5 py-2"
            >
              <p className="text-[10px] text-[var(--text-muted)] mb-0.5">
                {stat.label}
              </p>
              <p
                className="text-xs font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {stat.value}
              </p>
              {isNumeric && maxValue > 0 && (
                <div className="mt-1 h-1 w-full rounded-full bg-[var(--border-default)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

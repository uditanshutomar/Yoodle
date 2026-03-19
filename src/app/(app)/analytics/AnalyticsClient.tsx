"use client";

import dynamic from "next/dynamic";

const PulsePage = dynamic(() => import("@/components/pulse/PulsePage"), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div>
        <div className="h-10 w-32 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
        <div className="h-4 w-56 rounded-lg bg-[var(--surface-hover)] animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] h-[120px] animate-pulse"
          />
        ))}
      </div>
    </div>
  ),
});

export default function AnalyticsClient() {
  return <PulsePage />;
}

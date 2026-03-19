"use client";

import dynamic from "next/dynamic";

const BoardPage = dynamic(() => import("@/components/board/BoardPage"), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div>
        <div className="h-10 w-48 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
        <div className="h-4 w-80 rounded-lg bg-[var(--surface-hover)] animate-pulse mt-2" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 min-w-[240px] rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] h-[400px] animate-pulse"
          />
        ))}
      </div>
    </div>
  ),
});

export default function Page() {
  return <BoardPage />;
}

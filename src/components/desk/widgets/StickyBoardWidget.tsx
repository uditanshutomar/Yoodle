"use client";

import { StickyNote } from "lucide-react";

export default function StickyBoardWidget() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center h-full">
      <StickyNote
        size={28}
        className="text-[var(--text-muted)]"
        aria-hidden="true"
      />
      <p
        className="text-sm font-bold text-[var(--text-secondary)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Your tasks will appear here
      </p>
      <p
        className="text-xs text-[var(--text-muted)]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Connect a board in Preferences
      </p>
    </div>
  );
}

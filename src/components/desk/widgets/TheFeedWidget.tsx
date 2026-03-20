"use client";

import { Rss } from "lucide-react";

export default function TheFeedWidget() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center h-full">
      <Rss
        size={28}
        className="text-[var(--text-muted)]"
        aria-hidden="true"
      />
      <p
        className="text-sm font-bold text-[var(--text-secondary)] font-heading"
      >
        Workspace activity will appear here
      </p>
      <p
        className="text-xs text-[var(--text-muted)] font-body"
      >
        Coming soon
      </p>
    </div>
  );
}

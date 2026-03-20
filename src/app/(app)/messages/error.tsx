"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Error boundary for the messages section.
 * Catches SSE stream failures, conversation loading errors, etc.
 */
export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="text-center max-w-md">
        <span className="text-5xl mb-4 block" role="img" aria-label="chat error">
          💬
        </span>
        <h2
          className="text-xl font-black text-[var(--text-primary)] mb-2 font-heading"
        >
          Messages unavailable
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
          Could not load your conversations. This is usually a temporary issue.
        </p>
        {error.digest && (
          <p className="text-[10px] text-[var(--text-muted)] font-mono mb-4">
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--foreground)] text-[var(--background)] px-5 py-2.5 text-sm font-bold border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-heading"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

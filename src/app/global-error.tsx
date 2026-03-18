"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Global error boundary — catches unhandled errors in the root layout.
 * Reports to Sentry and shows a user-friendly error page.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">
            <span role="img" aria-label="ghost">
              👻
            </span>
          </div>
          <h1
            className="text-2xl font-black text-[var(--text-primary)] mb-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Something went wrong
          </h1>
          <p
            className="text-[var(--text-secondary)] mb-6"
            style={{ fontFamily: "var(--font-body)" }}
          >
            An unexpected error occurred. Our team has been notified and is
            working on a fix.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--foreground)] px-6 py-3 text-sm font-bold text-[var(--background)] transition-transform hover:scale-105 active:scale-95"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

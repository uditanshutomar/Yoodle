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
      <body className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">
            <span role="img" aria-label="ghost">
              👻
            </span>
          </div>
          <h1
            className="text-2xl font-black text-[#0A0A0A] mb-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Something went wrong
          </h1>
          <p
            className="text-[#0A0A0A]/60 mb-6"
            style={{ fontFamily: "var(--font-body)" }}
          >
            An unexpected error occurred. Our team has been notified and is
            working on a fix.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

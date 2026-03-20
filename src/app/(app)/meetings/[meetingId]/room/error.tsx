"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Error boundary for the meeting room page.
 * LiveKit connection failures, WebRTC errors, and media device issues
 * are caught here with a specialized recovery UI.
 */
export default function MeetingRoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const isConnectionError =
    error.message?.includes("WebSocket") ||
    error.message?.includes("connection") ||
    error.message?.includes("LiveKit") ||
    error.message?.includes("network");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md">
        <span className="text-5xl mb-4 block" role="img" aria-label="disconnected">
          📡
        </span>
        <h2
          className="text-xl font-black text-[var(--text-primary)] mb-2 font-heading"
        >
          {isConnectionError ? "Connection lost" : "Meeting room error"}
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
          {isConnectionError
            ? "Lost connection to the meeting server. Check your internet and try reconnecting."
            : "Something went wrong in the meeting room. You can try rejoining."}
        </p>
        {error.digest && (
          <p className="text-[10px] text-[var(--text-muted)] font-mono mb-4">
            Ref: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FFE600] text-[#0A0A0A] px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:outline-none font-heading"
          >
            Reconnect
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--border)] text-[var(--text-secondary)] px-5 py-2.5 text-sm font-bold transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

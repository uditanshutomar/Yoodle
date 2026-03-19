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
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-4">
      <div className="text-center max-w-md">
        <span className="text-5xl mb-4 block" role="img" aria-label="disconnected">
          📡
        </span>
        <h2
          className="text-xl font-black text-white mb-2"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {isConnectionError ? "Connection lost" : "Meeting room error"}
        </h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          {isConnectionError
            ? "Lost connection to the meeting server. Check your internet and try reconnecting."
            : "Something went wrong in the meeting room. You can try rejoining."}
        </p>
        {error.digest && (
          <p className="text-[10px] text-gray-600 font-mono mb-4">
            Ref: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-white text-[#0A0A0A] px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Reconnect
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-700 text-gray-300 px-5 py-2.5 text-sm font-bold transition-colors hover:border-gray-500"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

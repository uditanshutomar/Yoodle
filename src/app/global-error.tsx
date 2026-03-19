"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Global error boundary — catches unhandled errors in the root layout.
 * Reports to Sentry and shows a user-friendly error page.
 *
 * NOTE: This component replaces the entire root layout (including ThemeProvider),
 * so CSS custom properties are NOT available. All styles use inline/concrete values.
 * Dark mode is handled via useEffect to avoid dangerouslySetInnerHTML.
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

  // Apply dark mode styles via media query — no dangerouslySetInnerHTML needed
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = [
      "@media (prefers-color-scheme: dark) {",
      "  body.global-error { background-color: #0A0A0A !important; color: #FAFAF9 !important; }",
      "  .error-subtitle { color: #9CA3AF !important; }",
      "  .error-digest { color: #6B7280 !important; }",
      "  .error-btn { background-color: #FAFAF9 !important; color: #0A0A0A !important; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <html lang="en">
      <body
        className="global-error"
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          margin: 0,
          backgroundColor: "#FAFAF9",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#0A0A0A",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <div style={{ fontSize: "3.75rem", marginBottom: "1rem" }}>
            <span role="img" aria-label="ghost">
              👻
            </span>
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 900,
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            className="error-subtitle"
            style={{
              color: "#6B7280",
              marginBottom: "1.5rem",
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. Our team has been notified and is
            working on a fix.
          </p>
          {error.digest && (
            <p
              className="error-digest"
              style={{
                fontSize: "0.75rem",
                color: "#9CA3AF",
                marginBottom: "1.5rem",
                fontFamily: "monospace",
              }}
            >
              Error reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="error-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              borderRadius: "0.75rem",
              backgroundColor: "#0A0A0A",
              color: "#FAFAF9",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

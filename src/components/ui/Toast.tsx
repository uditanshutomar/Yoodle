"use client";

import { Toaster } from "sonner";

export default function ToastSetup() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-4 flex items-start gap-3 w-[360px]",
          title: "text-sm font-bold text-[var(--text-primary)]",
          description: "text-xs text-[var(--text-secondary)] mt-0.5",
          success: "border-l-4 border-l-[#22C55E]",
          error: "border-l-4 border-l-[#FF6B6B]",
          info: "border-l-4 border-l-[#06B6D4]",
        },
      }}
      style={
        {
          "--font-family": "var(--font-heading)",
        } as React.CSSProperties
      }
    />
  );
}

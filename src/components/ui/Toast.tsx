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
            "bg-white border-2 border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] p-4 flex items-start gap-3 w-[360px]",
          title: "text-sm font-bold text-[#0A0A0A]",
          description: "text-xs text-[#0A0A0A]/60 mt-0.5",
          success: "bg-green-50 border-[#0A0A0A]",
          error: "bg-red-50 border-[#0A0A0A]",
          info: "bg-cyan-50 border-[#0A0A0A]",
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

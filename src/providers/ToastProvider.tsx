"use client";

import ToastSetup from "@/components/ui/Toast";
import type { ReactNode } from "react";

export default function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastSetup />
    </>
  );
}

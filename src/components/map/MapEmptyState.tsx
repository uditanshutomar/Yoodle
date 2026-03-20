"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X } from "lucide-react";
import { MASCOT_BY_MODE } from "@/components/ai/constants";

interface MapEmptyStateProps {
  mode: string;
}

export default function MapEmptyState({ mode }: MapEmptyStateProps) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
        >
          <div className="relative text-center space-y-3 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--border-strong)] pointer-events-auto">
            {/* Close button */}
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              aria-label="Dismiss"
            >
              <X size={14} className="text-[var(--text-muted)]" />
            </button>

            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Image
                src={MASCOT_BY_MODE[mode] || MASCOT_BY_MODE.social}
                alt="Yoodle mascot"
                width={80}
                height={80}
                className="mx-auto mix-blend-multiply"
              />
            </motion.div>
            <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
              No one&apos;s nearby yet
            </p>
            <p className="text-xs text-[var(--text-muted)] font-body max-w-[200px]">
              Be the first to drop a pin! Others in your area will show up here.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

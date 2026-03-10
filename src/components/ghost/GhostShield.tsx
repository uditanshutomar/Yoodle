"use client";

import { ReactNode, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Ghost } from "lucide-react";
import { useGhostShield } from "@/hooks/useGhostShield";

interface GhostShieldProps {
  children: ReactNode;
  userName: string;
}

/**
 * GhostShield — Wraps ghost room content with multi-layered protection.
 *
 * - CSS: disables text selection, drag, callout menus
 * - Watermark: semi-transparent repeating pattern with user name + timestamp
 * - Visibility overlay: blurs content when tab is not focused
 * - Print: hidden via @media print (handled by useGhostShield hook)
 */
export default function GhostShield({ children, userName }: GhostShieldProps) {
  const { isHidden } = useGhostShield();
  const [watermarkTime, setWatermarkTime] = useState(() => formatTime());

  // Refresh watermark timestamp every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setWatermarkTime(formatTime());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const watermarkText = `${userName} \u2022 ${watermarkTime}`;

  return (
    <div
      className="ghost-shield relative"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      } as React.CSSProperties}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* Protected content */}
      {children}

      {/* ── Dynamic watermark overlay ─────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden"
        style={{ mixBlendMode: "multiply" }}
      >
        <div
          className="absolute"
          style={{
            top: "-50%",
            left: "-50%",
            width: "200%",
            height: "200%",
            transform: "rotate(-30deg)",
            display: "flex",
            flexWrap: "wrap",
            gap: "80px 120px",
            padding: "40px",
          }}
        >
          {Array.from({ length: 60 }).map((_, i) => (
            <span
              key={i}
              className="whitespace-nowrap text-[var(--text-primary)]"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "13px",
                fontWeight: 600,
                opacity: 0.04,
              }}
            >
              {watermarkText}
            </span>
          ))}
        </div>
      </div>

      {/* ── Visibility blur overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {isHidden && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{
              backdropFilter: "blur(30px)",
              WebkitBackdropFilter: "blur(30px)",
              backgroundColor: "rgba(124, 58, 237, 0.15)",
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-[#7C3AED] border-3 border-[var(--border-strong)] shadow-[4px_4px_0_var(--border-strong)] mb-6"
            >
              <Ghost size={36} className="text-white" />
            </motion.div>

            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={18} className="text-[#7C3AED]" />
              <h2
                className="text-xl font-black text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Content Protected
              </h2>
            </div>

            <p
              className="text-sm text-[var(--text-secondary)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Switch back to this tab to view ghost room
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTime(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

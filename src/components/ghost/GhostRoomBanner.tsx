"use client";

import { motion } from "framer-motion";
import { Ghost, AlertTriangle } from "lucide-react";
import GhostTimer from "./GhostTimer";

interface GhostRoomBannerProps {
  expiresAt: Date;
  title: string;
}

export default function GhostRoomBanner({ expiresAt, title }: GhostRoomBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border-2 border-[#7C3AED] p-4"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#7C3AED]/10 via-[#9333EA]/10 to-[#7C3AED]/10" />
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#7C3AED]/5 to-transparent"
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C3AED] border-2 border-[var(--border-strong)]"
          >
            <Ghost size={20} className="text-white" />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                {title}
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-[#7C3AED] text-white rounded-full" style={{ fontFamily: "var(--font-heading)" }}>
                GHOST
              </span>
            </div>
            <p className="flex items-center gap-1 text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
              <AlertTriangle size={10} /> Everything vanishes when this ends
            </p>
          </div>
        </div>

        <GhostTimer expiresAt={expiresAt} />
      </div>
    </motion.div>
  );
}

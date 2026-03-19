"use client";

import { motion } from "framer-motion";
import { Activity } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <motion.div
      className="flex flex-1 flex-col items-center justify-center py-24"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-[var(--border-strong)] bg-[#A855F7]/20 shadow-[4px_4px_0_var(--border-strong)]">
        <Activity size={32} className="text-[var(--text-primary)]" />
      </div>
      <h1
        className="mt-6 text-3xl font-black text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Pulse
      </h1>
      <p
        className="mt-2 text-[var(--text-secondary)]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Workspace analytics coming soon
      </p>
    </motion.div>
  );
}

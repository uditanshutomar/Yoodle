"use client";

import { motion } from "framer-motion";

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  provisioning: { color: "#F59E0B", bg: "#FEF3C7", label: "Provisioning" },
  running: { color: "#10B981", bg: "#D1FAE5", label: "Running" },
  stopped: { color: "#6B7280", bg: "#F3F4F6", label: "Stopped" },
  destroyed: { color: "#EF4444", bg: "#FEE2E2", label: "Destroyed" },
};

interface VMStatusBadgeProps {
  status: string;
}

export default function VMStatusBadge({ status }: VMStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.stopped;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{
        backgroundColor: config.bg,
        color: config.color,
        fontFamily: "var(--font-heading)",
      }}
    >
      <motion.div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: config.color }}
        animate={status === "running" || status === "provisioning" ? { opacity: [1, 0.3, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      {config.label}
    </div>
  );
}

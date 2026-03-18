"use client";

import { motion } from "framer-motion";
import type { ConnectionQuality } from "@/hooks/useConnectionQuality";

interface ConnectionIndicatorProps {
  quality: ConnectionQuality;
  rtt: number | null;
  packetLoss: number | null;
}

const QUALITY_CONFIG: Record<ConnectionQuality, { color: string; label: string; bars: number }> = {
  good: { color: "#22C55E", label: "Good", bars: 3 },
  fair: { color: "#FFE600", label: "Fair", bars: 2 },
  poor: { color: "#FF6B6B", label: "Poor", bars: 1 },
  unknown: { color: "#0A0A0A", label: "...", bars: 0 },
};

export default function ConnectionIndicator({
  quality,
  rtt,
  packetLoss,
}: ConnectionIndicatorProps) {
  const config = QUALITY_CONFIG[quality];

  return (
    <motion.div
      className="group relative flex items-center gap-1.5 rounded-full border border-[var(--border-strong)]/15 px-2.5 py-1 cursor-default"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Signal bars */}
      <div className="flex items-end gap-[2px] h-3">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className="w-[3px] rounded-sm border border-[var(--border-strong)]/10"
            style={{
              height: `${bar * 4}px`,
              backgroundColor:
                bar <= config.bars ? config.color : "#0A0A0A1A",
            }}
          />
        ))}
      </div>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
        <div className="rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 shadow-[2px_2px_0_var(--border-strong)] whitespace-nowrap">
          <p
            className="text-xs font-bold mb-1"
            style={{ fontFamily: "var(--font-heading)", color: config.color }}
          >
            {config.label} Connection
          </p>
          {rtt !== null && (
            <p className="text-[10px] text-[#0A0A0A]/60">
              Latency: {rtt}ms
            </p>
          )}
          {packetLoss !== null && (
            <p className="text-[10px] text-[#0A0A0A]/60">
              Packet loss: {packetLoss}%
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

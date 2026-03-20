"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navigation } from "lucide-react";
import Image from "next/image";
import { useUserMode, type UserMode } from "@/hooks/useUserMode";
import { MASCOT_BY_MODE } from "@/components/ai/constants";

const MODE_LABELS: Record<UserMode, { label: string; emoji: string; color: string }> = {
  social: { label: "Social", emoji: "🧋", color: "text-green-400" },
  lockin: { label: "Locked In", emoji: "🎧", color: "text-blue-400" },
  invisible: { label: "Ninja", emoji: "🥷", color: "text-gray-400" },
};

export default function MapWidget() {
  const router = useRouter();
  const { mode } = useUserMode();
  const modeInfo = MODE_LABELS[mode];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Current mode display */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <Image
            src={MASCOT_BY_MODE[mode]}
            alt={`${modeInfo.label} mascot`}
            width={40}
            height={40}
            className="rounded-full border-2 border-[var(--border-strong)]"
          />
          <span className="absolute -bottom-0.5 -right-0.5 text-xs">{modeInfo.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[var(--text-primary)] font-heading truncate">
            {modeInfo.label} Mode
          </p>
          <p className="text-[10px] text-[var(--text-muted)] font-body">
            {mode === "invisible"
              ? "You're hidden from everyone"
              : mode === "lockin"
                ? "Visible to colleagues only"
                : "Visible to all Yoodle users"}
          </p>
        </div>
      </div>

      {/* Open Map button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => router.push("/map")}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-3 py-2 text-sm font-bold text-[#0A0A0A] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-heading"
      >
        <Navigation size={14} aria-hidden="true" />
        Open Map
      </motion.button>
    </div>
  );
}

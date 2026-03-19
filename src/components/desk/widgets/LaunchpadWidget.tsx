"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Rocket, StickyNote } from "lucide-react";

export default function LaunchpadWidget() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleJoin = () => {
    const code = joinCode.trim();
    if (!code) return;
    router.push(`/meetings/join?code=${encodeURIComponent(code)}`);
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Start a Room */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => router.push("/meetings/new")}
        className="flex items-center gap-2 rounded-xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-3 py-2 text-sm font-bold text-[#0A0A0A] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <Rocket size={14} aria-hidden="true" />
        Start a Room
      </motion.button>

      {/* Join code input */}
      <div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border)] overflow-hidden">
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Room code"
          aria-label="Enter room code"
          className="flex-1 bg-transparent px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          style={{ fontFamily: "var(--font-body)" }}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleJoin}
          className="bg-[var(--foreground)] px-3 py-1.5 text-xs font-bold text-[var(--background)] border-l-2 border-[var(--border)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Join
        </motion.button>
      </div>

      {/* New Sticky */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => router.push("/board")}
        className="flex items-center gap-2 rounded-xl border-2 border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:border-[#A855F7] hover:text-[#A855F7] transition-colors"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <StickyNote size={14} aria-hidden="true" />
        New Sticky
      </motion.button>
    </div>
  );
}

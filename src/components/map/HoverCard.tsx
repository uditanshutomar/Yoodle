"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import type { NearbyUser } from "@/hooks/useNearbyUsers";

interface HoverCardProps {
  user: NearbyUser;
  onClose: () => void;
}

export default function HoverCard({ user, onClose }: HoverCardProps) {
  const router = useRouter();
  const [waving, setWaving] = useState(false);
  const [waved, setWaved] = useState(false);
  const [yoodling, setYoodling] = useState(false);
  const [yoodled, setYoodled] = useState(false);

  const handleWave = useCallback(async () => {
    if (waving || waved) return;
    setWaving(true);
    try {
      await fetch("/api/notifications/wave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId: user.id }),
      });
      setWaved(true);
    } catch {
      // Best effort
    } finally {
      setWaving(false);
    }
  }, [user.id, waving, waved]);

  const handleYoodle = useCallback(async () => {
    if (yoodling || yoodled) return;
    setYoodling(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        setYoodled(true);
      }
    } catch {
      // Best effort
    } finally {
      setYoodling(false);
    }
  }, [user.id, yoodling, yoodled]);

  const handleChat = useCallback(() => {
    router.push(`/messages?userId=${user.id}`);
  }, [router, user.id]);

  const displayName = user.displayName || user.name || "Unknown";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      className="relative"
    >
      <div className="w-56 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[4px_4px_0_var(--border-strong)]">
        {/* User info */}
        <div className="flex items-center gap-2.5 mb-2">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={displayName}
              width={32}
              height={32}
              className="rounded-full object-cover border border-[var(--border)]"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600]/20 border border-[var(--border)] text-sm font-bold font-heading">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)] truncate font-heading">
              {displayName}
            </p>
            {user.distanceKm !== undefined && (
              <p className="text-[11px] text-[var(--text-muted)] font-body">
                {user.distanceKm < 1
                  ? `${Math.round(user.distanceKm * 1000)}m away`
                  : `${user.distanceKm}km away`}
              </p>
            )}
          </div>
        </div>

        {/* Status */}
        {user.status && (
          <p className="text-xs text-[var(--text-secondary)] mb-3 font-body">
            {"\uD83D\uDCAC"} &quot;{user.status}&quot;
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleWave}
            disabled={waved}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold transition-all cursor-pointer font-heading ${
              waved
                ? "bg-green-100 text-green-700 border-green-300"
                : "bg-[#FFE600] text-[#0A0A0A] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none"
            }`}
          >
            <motion.span
              animate={waving ? { rotate: [0, 20, -20, 20, 0] } : {}}
              transition={{ duration: 0.5 }}
            >
              {"\uD83D\uDC4B"}
            </motion.span>
            {waved ? "Waved!" : "Wave"}
          </button>
          <button
            onClick={handleChat}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-all cursor-pointer font-heading"
          >
            {"\uD83D\uDCAC"} Chat
          </button>
          <button
            onClick={handleYoodle}
            disabled={yoodled}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold transition-all cursor-pointer font-heading ${
              yoodled
                ? "bg-green-100 text-green-700 border-green-300"
                : "bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none"
            }`}
          >
            {"\uD83E\uDD1D"} {yoodled ? "Yoodled!" : "Yoodle"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

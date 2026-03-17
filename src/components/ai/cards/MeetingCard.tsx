"use client";

import { Calendar, Users, Video, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { MeetingCardData } from "./types";

const STATUS_STYLES: Record<MeetingCardData["status"], string> = {
  scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  live: "bg-green-500/20 text-green-400 border-green-500/30",
  ended: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<MeetingCardData["status"], string> = {
  scheduled: "Upcoming",
  live: "Live",
  ended: "Ended",
  cancelled: "Cancelled",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface MeetingCardProps {
  data: MeetingCardData;
  onJoin?: (url: string) => void;
}

export default function MeetingCard({ data, onJoin }: MeetingCardProps) {
  const statusClass = STATUS_STYLES[data.status];
  const showJoin = data.status === "live" && !!data.joinUrl;
  const participants = data.participants ?? [];
  const visible = participants.slice(0, 3);
  const overflow = participants.length - 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2.5"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#FFE600]/15 text-[#FFE600]">
          <Calendar size={12} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className="text-xs font-medium leading-snug text-[var(--text-primary)] truncate"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {data.title}
            </p>
            <span
              className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${statusClass}`}
            >
              {STATUS_LABELS[data.status]}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {data.scheduledAt && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Clock size={9} />
                {formatTime(data.scheduledAt)}
              </span>
            )}

            {participants.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                <Users size={9} />
                {visible.map((p) => p.name).join(", ")}
                {overflow > 0 && (
                  <span className="text-[var(--text-muted)]">+{overflow}</span>
                )}
              </span>
            )}
          </div>
        </div>

        {showJoin && (
          <button
            onClick={() => onJoin?.(data.joinUrl!)}
            className="shrink-0 flex items-center gap-1 rounded-lg bg-green-500/20 px-2 py-1 text-[10px] font-semibold text-green-400 hover:bg-green-500/30 transition-colors"
          >
            <Video size={10} />
            Join
          </button>
        )}
      </div>
    </motion.div>
  );
}

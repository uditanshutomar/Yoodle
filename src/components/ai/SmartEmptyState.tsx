"use client";

import { useMemo } from "react";
import { Sun, Moon, CloudSun } from "lucide-react";
import Image from "next/image";
import SuggestionChips from "./SuggestionChips";
import { useAuth } from "@/hooks/useAuth";

function getGreeting(): { text: string; Icon: React.ElementType } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning", Icon: Sun };
  if (hour < 17) return { text: "Good afternoon", Icon: CloudSun };
  return { text: "Good evening", Icon: Moon };
}

const MASCOT_BY_MODE: Record<string, string> = {
  social: "/mascot-social.png",
  lockin: "/mascot-lockin.png",
  invisible: "/mascot-invisible.png",
};

interface SmartEmptyStateProps {
  onSend: (message: string) => void;
  briefingMetadata?: {
    unreadCount?: number;
    nextMeetingTime?: string | null;
    boardOverdueCount?: number | null;
    boardTaskCount?: number | null;
  } | null;
}

export default function SmartEmptyState({ onSend, briefingMetadata }: SmartEmptyStateProps) {
  const { user } = useAuth();
  const mascotSrc = MASCOT_BY_MODE[user?.mode || "social"] || MASCOT_BY_MODE.social;
  const { text: greeting, Icon: GreetingIcon } = getGreeting();
  const firstName = user?.displayName?.split(" ")[0] || user?.name?.split(" ")[0] || "";

  const insights = useMemo(() => {
    const items: Array<{ emoji: string; text: string; prompt: string }> = [];
    if (!briefingMetadata) return items;

    if (briefingMetadata.boardOverdueCount && briefingMetadata.boardOverdueCount > 0) {
      items.push({ emoji: "\u26A0\uFE0F", text: `${briefingMetadata.boardOverdueCount} tasks overdue`, prompt: "Show me my overdue tasks" });
    }
    if (briefingMetadata.nextMeetingTime) {
      const meetingDate = new Date(briefingMetadata.nextMeetingTime);
      const diff = meetingDate.getTime() - new Date().getTime();
      if (diff > 0 && diff < 2 * 60 * 60 * 1000) {
        const mins = Math.round(diff / 60000);
        items.push({ emoji: "\uD83D\uDCC5", text: `Meeting in ${mins} min`, prompt: "Prepare me for my next meeting" });
      }
    }
    if (briefingMetadata.unreadCount && briefingMetadata.unreadCount > 0) {
      items.push({ emoji: "\uD83D\uDCAC", text: `${briefingMetadata.unreadCount} unread messages`, prompt: "Summarize my unread messages" });
    }
    return items;
  }, [briefingMetadata]);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] mb-3">
        <Image src={mascotSrc} alt="Yoodle" width={40} height={40} className="mix-blend-multiply" />
      </div>

      <div className="flex items-center gap-1.5 mb-1">
        <GreetingIcon size={14} className="text-[#FFE600]" />
        <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </p>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4" style={{ fontFamily: "var(--font-body)" }}>
        How can I help you today?
      </p>

      {insights.length > 0 && (
        <div className="w-full max-w-xs space-y-1.5 mb-4">
          {insights.map((insight) => (
            <button
              key={insight.text}
              onClick={() => onSend(insight.prompt)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[#FFE600] transition-colors text-left"
            >
              <span className="text-sm">{insight.emoji}</span>
              <span className="text-[11px] text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }}>
                {insight.text}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="w-full max-w-xs">
        <p className="text-[10px] text-[var(--text-muted)] mb-2 text-center" style={{ fontFamily: "var(--font-body)" }}>
          Quick actions
        </p>
        <SuggestionChips onSelect={onSend} />
      </div>
    </div>
  );
}

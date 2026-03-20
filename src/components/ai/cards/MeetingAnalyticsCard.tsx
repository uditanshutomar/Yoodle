"use client";

import { BarChart3, Star, MessageCircle, AlertTriangle } from "lucide-react";
import type { MeetingAnalyticsCardData, HighlightType } from "./types";

interface Props {
  data: MeetingAnalyticsCardData;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-500";
  if (score >= 40) return "text-yellow-500";
  return "text-red-500";
}

function barColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

const HIGHLIGHT_ICON: Record<HighlightType, React.ReactNode> = {
  decision: <Star size={12} className="text-yellow-500 shrink-0" />,
  key_point: <Star size={12} className="text-yellow-500 shrink-0" />,
  disagreement: <AlertTriangle size={12} className="text-red-400 shrink-0" />,
  commitment: <MessageCircle size={12} className="text-blue-400 shrink-0" />,
};

const BREAKDOWN_LABELS: Record<string, string> = {
  agendaCoverage: "Agenda Coverage",
  decisionDensity: "Decision Density",
  actionItemClarity: "Action Item Clarity",
  participationBalance: "Participation Balance",
};

export default function MeetingAnalyticsCard({ data }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-[var(--text-muted)]" />
          <h4
            className="text-xs font-bold text-[var(--text-primary)] font-heading"
          >
            {data.meetingTitle}
          </h4>
        </div>
        <span className={`text-lg font-bold ${scoreColor(data.score)}`}>
          {data.score}
        </span>
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(data.scoreBreakdown).map(([key, value]) => (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">
                {BREAKDOWN_LABELS[key] ?? key}
              </span>
              <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                {value}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(value)}`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Speaker Stats */}
      {data.speakerStats.length > 0 && (
        <div className="space-y-1.5">
          <p
            className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] font-heading"
          >
            Speaker Stats
          </p>
          {data.speakerStats.map((speaker, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-primary)] w-16 truncate shrink-0">
                {speaker.name}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#FFE600]"
                  style={{ width: `${speaker.talkTimePercent}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-[var(--text-muted)] w-8 text-right shrink-0">
                {speaker.talkTimePercent}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Highlights */}
      {data.highlights.length > 0 && (
        <div className="space-y-1">
          <p
            className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] font-heading"
          >
            Highlights
          </p>
          {data.highlights.map((h, i) => (
            <div key={i} className="flex items-start gap-1.5">
              {HIGHLIGHT_ICON[h.type] ?? <Star size={12} className="text-[var(--text-muted)] shrink-0" />}
              <span className="text-[11px] text-[var(--text-primary)]">{h.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

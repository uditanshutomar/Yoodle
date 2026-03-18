"use client";

import { FileText, CheckSquare, Lightbulb, ExternalLink } from "lucide-react";
import type { MeetingBriefCardData } from "./types";

interface Props {
  data: MeetingBriefCardData;
}

export default function MeetingBriefCard({ data }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--text-muted)]" />
          <h4
            className="text-xs font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {data.meetingTitle}
          </h4>
        </div>
        {data.docUrl && (
          <a
            href={data.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ExternalLink size={12} />
            Google Doc
          </a>
        )}
      </div>

      {/* Sources */}
      {(data.sources?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p
            className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Sources
          </p>
          {data.sources.slice(0, 5).map((source, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase font-semibold bg-muted px-1.5 py-0.5 rounded">
                  {source.type}
                </span>
                <span className="text-[11px] font-medium text-[var(--text-primary)]">
                  {source.title}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] pl-1">
                {source.summary}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Carryover Items */}
      {(data.carryoverItems?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckSquare size={12} className="text-[var(--text-muted)]" />
            <p
              className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Carryover Items
            </p>
          </div>
          <ul className="space-y-0.5 pl-4">
            {data.carryoverItems.map((item, i) => (
              <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc">
                {item.task}
                <span className="text-[var(--text-muted)]"> — from {item.fromMeetingTitle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Agenda Suggestions */}
      {(data.agendaSuggestions?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Lightbulb size={12} className="text-[var(--text-muted)]" />
            <p
              className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Suggested Agenda
            </p>
          </div>
          <ul className="space-y-0.5 pl-4">
            {data.agendaSuggestions.map((suggestion, i) => (
              <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

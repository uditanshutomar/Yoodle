"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, Brain, ArrowRight } from "lucide-react";

interface MeetingPreview {
  id: string;
  title: string;
  scheduledAt: string;
  aiPreview?: string;
  participantCount: number;
}

export default function MeetingPulse() {
  const [meetings, setMeetings] = useState<MeetingPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/meetings?status=scheduled&limit=5", {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setMeetings(data.data || []);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-sm font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Calendar className="inline -mt-0.5 mr-1 text-[#3B82F6]" size={15} />
            Meeting Pulse
          </h2>
        </div>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--surface-hover)] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden p-4">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-sm font-bold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Calendar className="inline -mt-0.5 mr-1 text-[#3B82F6]" size={15} />
          Meeting Pulse
        </h2>
        <span
          className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {meetings.length} upcoming
        </span>
      </div>

      {error ? (
        <p className="text-xs text-[var(--text-muted)] text-center py-6">
          Could not load meetings
        </p>
      ) : meetings.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] text-center py-6">
          No upcoming meetings
        </p>
      ) : (
        <div className="space-y-1.5">
          {meetings.map((m) => {
            const dt = new Date(m.scheduledAt);
            const isValidDate = !isNaN(dt.getTime());
            const date = isValidDate ? dt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }) : "—";
            const time = isValidDate ? dt.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            }) : "—";

            return (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="group flex items-center gap-3 rounded-xl border-[1.5px] border-[var(--border)] p-2.5 hover:border-[var(--border-strong)] transition-all bg-[var(--surface)]"
              >
                <div className="flex flex-col items-center text-center min-w-[48px]">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                    {date}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {time}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug truncate">
                    {m.title}
                  </p>
                  {m.aiPreview && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 flex items-center gap-1">
                      <Brain size={11} className="shrink-0 text-[#A855F7]" />
                      {m.aiPreview}
                    </p>
                  )}
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {m.participantCount} participant{m.participantCount !== 1 ? "s" : ""}
                  </span>
                </div>

                <ArrowRight
                  size={14}
                  className="shrink-0 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

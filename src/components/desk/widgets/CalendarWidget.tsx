"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Clock, CalendarX, ArrowRight, Video, RefreshCw } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  meetLink?: string;
}

function getYoodleLink(ev: CalendarEvent): string | null {
  const pattern = /https?:\/\/[^\s]+\/meetings\/yoo-[a-z0-9]+-[a-z0-9]+\/room/i;
  if (ev.location) {
    const match = ev.location.match(pattern);
    if (match) return match[0];
  }
  if (ev.description) {
    const match = ev.description.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export default function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchEvents = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    try {
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults: "6",
      });

      const res = await fetch(`/api/calendar/events?${params}`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      if (res.status === 403) {
        setConnected(false);
        setEvents([]);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(`Failed (${res.status})`);

      const json = await res.json();
      if (!mountedRef.current) return;

      setConnected(true);
      setEvents(json.data || []);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchEvents();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-12 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center h-full">
        <CalendarX
          size={28}
          className="text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-[var(--text-secondary)] font-heading">
          Calendar not connected
        </p>
        <Link
          href="/settings"
          className="text-xs font-bold text-[#FFE600] hover:underline font-heading"
        >
          Connect in Settings &rarr;
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="text-xs text-[#FF6B6B] font-body">{error}</p>
        <button
          onClick={fetchEvents}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[#FFE600] transition-colors font-heading cursor-pointer"
        >
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center h-full">
        <Clock
          size={28}
          className="text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-[var(--text-secondary)] font-heading">
          Nothing scheduled today
        </p>
        <Link
          href="/calendar"
          className="text-xs font-bold text-[#FFE600] hover:underline font-heading"
        >
          Open Calendar &rarr;
        </Link>
      </div>
    );
  }

  // Determine which events are current/upcoming vs past
  const now = new Date();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1.5 overflow-auto">
        {events.slice(0, 4).map((ev) => {
          const startDate = new Date(ev.start);
          const endDate = new Date(ev.end);
          const isPast = endDate < now;
          const isNow = startDate <= now && endDate >= now;

          const timeStr = startDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
          const endStr = endDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });

          return (
            <div
              key={ev.id}
              className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2 transition-colors ${
                isNow
                  ? "border-[#FFE600] bg-[#FFE600]/10"
                  : isPast
                    ? "border-[var(--border)] opacity-50"
                    : "border-[var(--border)] hover:border-[#FFE600]"
              }`}
            >
              {/* Time indicator */}
              <div className="flex flex-col items-center shrink-0 w-10">
                {isNow && (
                  <span className="text-[8px] font-black text-[#FFE600] uppercase tracking-wider font-heading mb-0.5">
                    Now
                  </span>
                )}
                <span className="text-[11px] font-bold text-[var(--text-primary)] font-heading leading-tight">
                  {timeStr}
                </span>
                <span className="text-[9px] text-[var(--text-muted)] font-body">
                  {endStr}
                </span>
              </div>

              {/* Divider */}
              <div
                className={`w-0.5 self-stretch rounded-full shrink-0 ${
                  isNow ? "bg-[#FFE600]" : "bg-[var(--border)]"
                }`}
              />

              {/* Event info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[var(--text-primary)] truncate font-heading">
                  {ev.title}
                </p>
              </div>

              {/* Join link — prefer Yoodle Room, fallback to Meet */}
              {isNow && (() => {
                const yoodleLink = getYoodleLink(ev);
                if (yoodleLink) {
                  return (
                    <a
                      href={yoodleLink}
                      className="shrink-0 flex items-center gap-1 rounded-lg bg-[#FFE600]/20 border border-[#FFE600]/40 px-2 py-1 text-[10px] font-bold text-[var(--text-primary)] hover:bg-[#FFE600]/30 transition-colors font-heading"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Video size={10} />
                      Join
                    </a>
                  );
                }
                if (ev.meetLink) {
                  return (
                    <a
                      href={ev.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors font-heading"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Video size={10} />
                      Meet
                    </a>
                  );
                }
                return null;
              })()}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {events.length > 0 && (
        <Link
          href="/calendar"
          className="mt-2 flex items-center justify-center gap-1 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[#FFE600] hover:text-[var(--text-primary)] transition-colors font-heading"
        >
          View full calendar
          <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

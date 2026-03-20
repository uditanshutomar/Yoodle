"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";

interface Meeting {
  _id: string;
  title: string;
  scheduledAt?: string;
  startTime?: string;
}

export default function UpNextWidget() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function fetchMeetings() {
      try {
        const res = await fetch("/api/meetings?status=scheduled&limit=5", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = await res.json();
        if (!mountedRef.current) return;

        const list =
          Array.isArray(json?.data) ? json.data : json?.data?.meetings ?? json?.meetings ?? [];
        setMeetings(list);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    fetchMeetings();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-14 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-[#FF6B6B] font-body">
        {error}
      </p>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Clock
          size={28}
          className="text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <p
          className="text-sm font-bold text-[var(--text-secondary)] font-heading"
        >
          No upcoming meetings
        </p>
        <Link
          href="/meetings/new"
          className="text-xs font-bold text-[#A855F7] hover:underline font-heading"
        >
          Start a Room &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {meetings.map((m) => {
        const time = m.scheduledAt || m.startTime;
        const formatted = time
          ? new Date(time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        return (
          <Link
            key={m._id}
            href={`/meetings/${m._id}`}
            className="group flex items-center gap-3 rounded-xl border-2 border-[var(--border)] px-3 py-2.5 transition-colors hover:border-[#FFE600]"
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-bold text-[var(--text-primary)] truncate font-heading"
              >
                {m.title}
              </p>
              {formatted && (
                <p
                  className="text-xs text-[var(--text-muted)] font-body"
                >
                  {formatted}
                </p>
              )}
            </div>
            <ArrowRight
              size={14}
              className="flex-shrink-0 text-[var(--text-muted)] group-hover:text-[#FFE600] transition-colors"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}

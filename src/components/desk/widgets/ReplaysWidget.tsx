"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Play, RefreshCw } from "lucide-react";

interface Meeting {
  _id: string;
  title: string;
  scheduledAt?: string;
  startTime?: string;
  endTime?: string;
}

export default function ReplaysWidget() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchMeetings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/meetings?status=completed&limit=3", {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      if (!mountedRef.current) return;

      const list = Array.isArray(json?.data) ? json.data : json?.data?.meetings ?? json?.meetings ?? [];
      setMeetings(list);
      setError(null);
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
    fetchMeetings();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchMeetings]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-10 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p
          className="text-xs text-[#FF6B6B] font-body"
        >
          {error}
        </p>
        <button
          onClick={fetchMeetings}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[#FFE600] transition-colors font-heading"
        >
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Play
          size={28}
          className="text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <p
          className="text-sm font-bold text-[var(--text-secondary)] font-heading"
        >
          No past meetings yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {meetings.map((m) => {
        const time = m.endTime || m.scheduledAt || m.startTime;
        const formatted = time
          ? new Date(time).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })
          : "";

        return (
          <Link
            key={m._id}
            href={`/meetings/${m._id}`}
            className="group flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 hover:border-[#FFE600] transition-colors"
          >
            <Play
              size={12}
              className="flex-shrink-0 text-[var(--text-muted)] group-hover:text-[#FFE600] transition-colors"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-bold text-[var(--text-primary)] truncate font-heading"
              >
                {m.title}
              </p>
            </div>
            {formatted && (
              <span
                className="text-[10px] text-[var(--text-muted)] flex-shrink-0 font-body"
              >
                {formatted}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Play } from "lucide-react";

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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function fetchMeetings() {
      try {
        const res = await fetch("/api/meetings?status=completed&limit=3", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json = await res.json();
        if (!mountedRef.current) return;

        const list = json?.data?.meetings ?? json?.meetings ?? [];
        setMeetings(list);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
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
            className="h-10 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
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
          className="text-sm font-bold text-[var(--text-secondary)]"
          style={{ fontFamily: "var(--font-heading)" }}
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
                className="text-xs font-bold text-[var(--text-primary)] truncate"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {m.title}
              </p>
            </div>
            {formatted && (
              <span
                className="text-[10px] text-[var(--text-muted)] flex-shrink-0"
                style={{ fontFamily: "var(--font-body)" }}
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

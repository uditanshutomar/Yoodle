"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";

interface TrendData {
  totalMeetings: number;
  avgScore: number;
  totalDecisions: number;
  totalActionItems: number;
}

export default function PulseCheckWidget() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchTrends = useCallback(async () => {
    // Abort any previous in-flight request
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/meetings/analytics/trends?range=month", {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      if (!mountedRef.current) return;

      const d = json?.data ?? json;
      setData({
        totalMeetings: d.totalMeetings ?? 0,
        avgScore: d.avgScore ?? 0,
        totalDecisions: d.totalDecisions ?? 0,
        totalActionItems: d.totalActionItems ?? 0,
      });
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
    fetchTrends();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchTrends]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-16 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p
          className="text-xs text-[#FF6B6B]"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {error}
        </p>
        <button
          onClick={fetchTrends}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[#FFE600] transition-colors"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const vibeColor =
    data.avgScore >= 70
      ? "text-green-600"
      : data.avgScore >= 40
        ? "text-yellow-600"
        : "text-[#FF6B6B]";

  const stats = [
    { label: "Meetings", value: data.totalMeetings },
    { label: "Vibe Check", value: `${Math.round(data.avgScore)}%`, className: vibeColor },
    { label: "Decisions", value: data.totalDecisions },
    { label: "Actions", value: data.totalActionItems },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] px-2 py-3"
        >
          <span
            className={`text-lg font-black ${s.className ?? "text-[var(--text-primary)]"}`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {s.value}
          </span>
          <span
            className="text-[10px] text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

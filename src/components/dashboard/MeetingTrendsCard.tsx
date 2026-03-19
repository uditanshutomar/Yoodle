"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

interface TrendsData {
  range: string;
  totalMeetings: number;
  avgScore: number;
  totalDecisions: number;
  totalActionItems: number;
  avgDuration: number;
  patterns: { type: string; message: string; severity: string }[];
}

export default function MeetingTrendsCard() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"week" | "month" | "quarter">("month");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchTrends() {
      try {
        const res = await fetch(`/api/meetings/analytics/trends?range=${range}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error(`Failed to load trends (${res.status})`);
        const json = await res.json();
        if (json?.data) setData(json.data);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[MeetingTrendsCard] Fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load trends");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchTrends();
    return () => controller.abort();
  }, [range]);

  const scoreColor = data ? (data.avgScore >= 70 ? "#22C55E" : data.avgScore >= 40 ? "#F59E0B" : "#EF4444") : "#6B7280";

  return (
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[var(--border-strong)]">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-[#A855F7]" />
          <span className="font-bold text-sm" style={{ fontFamily: "var(--font-heading)" }}>Meeting Trends</span>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as "week" | "month" | "quarter")}
          className="text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 cursor-pointer"
        >
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
        </select>
      </div>
      <div className="p-4">
        {loading && !data ? (
          <div className="text-center py-4 text-sm text-[var(--text-secondary)]">Loading trends…</div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-sm text-[#FF6B6B] mb-2">{error}</p>
            <button
              onClick={() => setRange((r) => r)}
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <RefreshCw size={10} /> Retry
            </button>
          </div>
        ) : !data || data.totalMeetings === 0 ? (
          <div className="text-center py-4 text-sm text-[var(--text-secondary)]">No meeting data yet</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Meetings", value: data.totalMeetings },
                { label: "Avg Score", value: data.avgScore, color: scoreColor },
                { label: "Decisions", value: data.totalDecisions },
                { label: "Actions", value: data.totalActionItems },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-lg font-black" style={s.color ? { color: s.color } : undefined}>{s.value}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{s.label}</div>
                </div>
              ))}
            </div>
            {data.patterns.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                {data.patterns.slice(0, 3).map((p, i) => {
                  const dotColor = { info: "#3B82F6", warning: "#F59E0B", critical: "#EF4444" }[p.severity] || "#6B7280";
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: dotColor }} />
                      <span className="text-[var(--text-secondary)]">{p.message}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

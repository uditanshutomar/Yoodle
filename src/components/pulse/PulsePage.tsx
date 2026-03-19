"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, RefreshCw, BarChart3, CheckSquare, Users, Clock } from "lucide-react";

type Range = "week" | "month" | "quarter";

interface Pattern {
  type: string;
  message: string;
  severity: string;
}

interface PulseData {
  totalMeetings: number;
  avgScore: number;
  totalDecisions: number;
  totalActionItems: number;
  avgDuration: number;
  patterns: Pattern[];
}

function vibeColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

function severityDotColor(severity: string): string {
  if (severity === "critical") return "#EF4444";
  if (severity === "warning") return "#F59E0B";
  return "#3B82F6";
}

export default function PulsePage() {
  const [range, setRange] = useState<Range>("week");
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (r: Range) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/meetings/analytics/trends?range=${r}`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!controller.signal.aborted) {
        setData(json.data || null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError("Failed to load analytics");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData(range);
    return () => { abortRef.current?.abort(); };
  }, [range, fetchData]);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight"
            style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
          >
            Pulse
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
            Your workspace heartbeat
          </p>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1">
          {(["week", "month", "quarter"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                range === r
                  ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              }`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] h-[120px] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="rounded-2xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-6 py-4 text-center">
            <p className="text-sm font-bold text-[#FF6B6B] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
              {error}
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => fetchData(range)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6B6B] bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 rounded-xl px-4 py-2 hover:bg-[#FF6B6B]/20 transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <RefreshCw size={14} /> Retry
            </motion.button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.totalMeetings === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
            <Activity size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            No meeting data yet
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Start hosting to see your Pulse
          </p>
        </div>
      )}

      {/* Data */}
      {!loading && !error && data && data.totalMeetings > 0 && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Users size={18} />}
              label="Meetings"
              value={data.totalMeetings}
            />
            <StatCard
              icon={<BarChart3 size={18} />}
              label="Avg Vibe Check"
              value={Math.round(data.avgScore)}
              color={vibeColor(data.avgScore)}
            />
            <StatCard
              icon={<CheckSquare size={18} />}
              label="Decisions"
              value={data.totalDecisions}
            />
            <StatCard
              icon={<Clock size={18} />}
              label="Action Items"
              value={data.totalActionItems}
            />
          </div>

          {/* Heads Up section */}
          {data.patterns && data.patterns.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[var(--text-secondary)]" />
                <h2
                  className="text-lg font-bold text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Heads Up
                </h2>
              </div>
              <div className="space-y-2">
                {data.patterns.map((pattern, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] px-5 py-4 flex items-start gap-3"
                  >
                    <span
                      className="mt-1 flex-shrink-0 h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: severityDotColor(pattern.severity) }}
                    />
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                      {pattern.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] p-5"
    >
      <div className="flex items-center gap-2 mb-3 text-[var(--text-muted)]">
        {icon}
        <span className="text-xs font-bold" style={{ fontFamily: "var(--font-heading)" }}>
          {label}
        </span>
      </div>
      <p
        className="text-3xl font-black"
        style={{
          fontFamily: "var(--font-heading)",
          color: color || "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </motion.div>
  );
}

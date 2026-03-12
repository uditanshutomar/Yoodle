"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Video,
  Radio,
  Activity,
  BarChart3,
  Shield,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { features, getEditionName } from "@/lib/features/flags";

interface AnalyticsSummary {
  overview: {
    totalUsers: number;
    totalMeetings: number;
    activeMeetings: number;
    recentEvents: number;
  };
  trends: {
    meetingsLast30d: number;
    meetingsLast7d: number;
  };
  eventBreakdown: { type: string; count: number }[];
}

const STAT_CARDS = [
  { key: "totalUsers", label: "Total Users", icon: Users, color: "#06B6D4" },
  {
    key: "totalMeetings",
    label: "Total Meetings",
    icon: Video,
    color: "#FFE600",
  },
  { key: "activeMeetings", label: "Live Now", icon: Radio, color: "#FF6B6B" },
  {
    key: "recentEvents",
    label: "Events (7d)",
    icon: Activity,
    color: "#A855F7",
  },
] as const;

function formatEventType(type: string): string {
  return type.replace(/_/g, " ");
}

export default function AdminDashboard() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  const refresh = useCallback(() => {
    fetch("/api/analytics/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(res.error?.message || "Failed to load analytics");
      })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => { setLoading(false); setLastRefresh(new Date()); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastRefresh]);

  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#0A0A0A]/10 animate-pulse" />
          <div className="h-8 w-48 rounded-lg bg-[#0A0A0A]/10 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border-2 border-[#0A0A0A]/10 bg-white p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#0A0A0A]/10 animate-pulse" />
                <div className="h-4 w-20 rounded bg-[#0A0A0A]/10 animate-pulse" />
              </div>
              <div className="h-9 w-16 rounded bg-[#0A0A0A]/10 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border-2 border-[#0A0A0A]/10 bg-white p-5">
              <div className="h-5 w-32 rounded bg-[#0A0A0A]/10 animate-pulse mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-4 w-full rounded bg-[#0A0A0A]/10 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p
          className="text-lg text-[#FF6B6B] font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {error || "No data available"}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-[#0A0A0A] bg-[#FFE600] shadow-[2px_2px_0_#0A0A0A]">
          <Shield size={20} />
        </div>
        <h1
          className="text-2xl font-bold text-[#0A0A0A]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Admin Dashboard
          <span
            className="ml-3 inline-flex items-center rounded-full border-2 border-[#0A0A0A] px-3 py-0.5 text-xs font-bold"
            style={{
              fontFamily: "var(--font-heading)",
              backgroundColor: features.isCloud ? "#06B6D4" : "#22C55E",
              color: features.isCloud ? "white" : "#0A0A0A",
            }}
          >
            {getEditionName()}
          </span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); refresh(); }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-[#0A0A0A] bg-white hover:bg-[#FFE600] transition-colors shadow-[2px_2px_0_#0A0A0A] hover:shadow-[1px_1px_0_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer"
            aria-label="Refresh analytics"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <span className="text-xs text-[#0A0A0A]/40">
            Updated {secondsAgo}s ago
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map((card, i) => {
          const Icon = card.icon;
          const value = data.overview[card.key];
          const iconColor =
            card.color === "#FFE600" ? "text-[#0A0A0A]" : "text-white";

          return (
            <motion.div
              key={card.key}
              className="rounded-xl border-2 border-[#0A0A0A] bg-white p-5 shadow-[4px_4px_0_#0A0A0A]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-[#0A0A0A]"
                  style={{ backgroundColor: card.color }}
                >
                  <Icon size={16} className={iconColor} />
                </div>
                <span
                  className="text-xs font-bold text-[#0A0A0A]/60 uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {card.label}
                </span>
              </div>
              <p
                className="text-3xl font-bold text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {value.toLocaleString()}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Trends and event breakdown */}
      {(() => {
        const weeklyRate = data.trends.meetingsLast7d;
        const avgWeekly = data.trends.meetingsLast30d / 4.3;
        const trendPct = avgWeekly > 0 ? Math.round(((weeklyRate - avgWeekly) / avgWeekly) * 100) : 0;
        const maxCount = Math.max(...data.eventBreakdown.map(e => e.count), 1);
        return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl border-2 border-[#0A0A0A] bg-white p-5 shadow-[4px_4px_0_#0A0A0A]">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-[#0A0A0A]/60" />
            <h2
              className="text-base font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Meeting Trends
            </h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#0A0A0A]/60">Last 7 days</span>
              <div className="flex items-center gap-2">
                <span
                  className="text-lg font-bold"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {data.trends.meetingsLast7d}
                </span>
                {trendPct !== 0 && (
                  <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${trendPct > 0 ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#FF6B6B]/10 text-[#FF6B6B]"}`}>
                    {trendPct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(trendPct)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#0A0A0A]/60">Last 30 days</span>
              <span
                className="text-lg font-bold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {data.trends.meetingsLast30d}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-[#0A0A0A] bg-white p-5 shadow-[4px_4px_0_#0A0A0A]">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-[#0A0A0A]/60" />
            <h2
              className="text-base font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Event Breakdown (30d)
            </h2>
          </div>
          {data.eventBreakdown.length === 0 ? (
            <p className="text-sm text-[#0A0A0A]/40">
              No events recorded yet
            </p>
          ) : (
            <div className="space-y-2">
              {data.eventBreakdown.map((event) => (
                <div key={event.type} className="flex items-center gap-3">
                  <span className="text-sm text-[#0A0A0A]/60 w-32 truncate">
                    {formatEventType(event.type)}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-[#0A0A0A]/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-[#FFE600]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(event.count / maxCount) * 100}%` }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                    />
                  </div>
                  <span className="text-sm font-bold w-8 text-right" style={{ fontFamily: "var(--font-heading)" }}>
                    {event.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
        );
      })()}
    </div>
  );
}

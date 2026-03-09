"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Video,
  Radio,
  Activity,
  BarChart3,
  Shield,
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

  useEffect(() => {
    fetch("/api/analytics/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error?.message || "Failed to load analytics");
        }
      })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p
          className="text-lg font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Loading...
        </p>
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
              <span
                className="text-lg font-bold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {data.trends.meetingsLast7d}
              </span>
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
                <div
                  key={event.type}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-[#0A0A0A]/60">
                    {formatEventType(event.type)}
                  </span>
                  <span
                    className="text-sm font-bold rounded-full bg-[#0A0A0A]/5 px-2 py-0.5"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {event.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

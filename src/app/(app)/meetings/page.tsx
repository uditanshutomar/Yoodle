"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Video, Plus, Calendar, Users, Clock, History } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface MeetingSummary {
  id: string;
  title: string;
  code: string;
  status: string;
  type: string;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  participantCount: number;
  createdAt: string;
}

const statusColors: Record<string, "default" | "success" | "danger" | "info"> = {
  scheduled: "default",
  live: "success",
  ended: "info",
  cancelled: "danger",
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMins >= 0 && diffMins < 60) return `in ${diffMins} min`;
  if (diffHours >= 1 && diffHours < 24) return `in ${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPastDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MeetingCard({ meeting, isPast }: { meeting: MeetingSummary; isPast?: boolean }) {
  const router = useRouter();
  const dateStr = meeting.scheduledAt || meeting.createdAt;

  return (
    <Link href={isPast ? `/meetings/${meeting.id}/recording` : `/meetings/${meeting.id}`}>
      <Card hover className="!p-5 cursor-pointer h-full">
        <div className="flex items-start justify-between mb-3">
          <Badge variant={statusColors[meeting.status] || "default"}>
            {meeting.status === "live" && (
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
            )}
            {meeting.status}
          </Badge>
          {meeting.type === "ghost" && (
            <Badge variant="info">Ghost</Badge>
          )}
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
          {meeting.title}
        </h3>
        <p className="text-xs text-[var(--text-muted)] font-mono mb-3" style={{ fontFamily: "var(--font-body)" }}>
          {meeting.code}
        </p>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <Users size={12} /> {meeting.participantCount}
          </span>
          {dateStr && (
            <span className="flex items-center gap-1">
              <Calendar size={12} /> {isPast ? formatPastDate(dateStr) : formatRelativeDate(dateStr)}
            </span>
          )}
          {isPast && meeting.startedAt && meeting.endedAt && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {(() => {
                const mins = Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000);
                return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
              })()}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetch("/api/meetings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setMeetings(
            data.data.map((m: Record<string, unknown>) => ({
              id: (m._id as string) || (m.id as string),
              title: m.title as string,
              code: m.code as string,
              status: m.status as string,
              type: m.type as string,
              scheduledAt: m.scheduledAt as string | undefined,
              startedAt: m.startedAt as string | undefined,
              endedAt: m.endedAt as string | undefined,
              participantCount: Array.isArray(m.participants) ? m.participants.length : 0,
              createdAt: m.createdAt as string,
            }))
          );
          setError("");
        } else {
          setError(data.error?.message || "Failed to load meetings");
        }
      })
      .catch(() => setError("Something went wrong. Please try again."))
      .finally(() => setLoading(false));
  }, [retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError("");
    setRetryCount((c) => c + 1);
  };

  // Split meetings into upcoming (scheduled/live) and past (ended/cancelled)
  // Past meetings only show for 24 hours — after that they're only in Meeting History
  const upcoming = meetings.filter((m) => m.status === "scheduled" || m.status === "live");
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const past = meetings.filter((m) => {
    if (m.status !== "ended" && m.status !== "cancelled") return false;
    const endTime = m.endedAt || m.startedAt || m.createdAt;
    if (!endTime) return false;
    return now - new Date(endTime).getTime() < TWENTY_FOUR_HOURS;
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE600] border-2 border-[var(--border-strong)]">
            <Video size={20} className="text-[#0A0A0A]" />
          </div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Meetings
          </h1>
        </div>
        <Button variant="primary" size="md" icon={Plus} href="/meetings/new">
          New Meeting
        </Button>
      </motion.div>

      {/* Error banner */}
      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-[#FF6B6B]/10 border-2 border-[#FF6B6B] rounded-xl px-4 py-3 flex items-center justify-between"
        >
          <p className="text-sm font-bold text-[#FF6B6B]" style={{ fontFamily: "var(--font-heading)" }}>
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="text-sm font-bold text-[#FF6B6B] underline cursor-pointer hover:text-[#FF6B6B]/80 transition-colors"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Retry
          </button>
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#FFE600] border-t-transparent rounded-full" />
        </div>
      ) : (upcoming.length === 0 && past.length === 0) ? (
        <motion.div variants={itemVariants}>
          <EmptyState
            title="No meetings yet"
            description="Create your first meeting to get started. Invite your team and start collaborating!"
            action={{ label: "Create Meeting", onClick: () => router.push("/meetings/new"), icon: Plus }}
          />
        </motion.div>
      ) : (
        <>
          {/* Upcoming / Live Meetings */}
          {upcoming.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-[#22C55E]" />
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                  Upcoming & Live
                </h2>
                <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--surface-hover)] rounded-full px-2 py-0.5">
                  {upcoming.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Past Meetings */}
          {past.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-[var(--text-muted)]" />
                <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                  Past Meetings
                </h2>
                <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--surface-hover)] rounded-full px-2 py-0.5">
                  {past.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {past.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} isPast />
                ))}
              </div>
            </motion.div>
          )}

          {/* Only past meetings, no upcoming */}
          {upcoming.length === 0 && past.length > 0 && (
            <motion.div variants={itemVariants} className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center">
              <p className="text-sm text-[var(--text-muted)] mb-2" style={{ fontFamily: "var(--font-body)" }}>
                No upcoming meetings scheduled.
              </p>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => router.push("/meetings/new")}>
                Schedule a Meeting
              </Button>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}

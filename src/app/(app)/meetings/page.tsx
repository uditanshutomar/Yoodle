"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Video, Plus, Calendar, Users, Clock, Ghost, ChevronDown } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

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

interface GhostRoomSummary {
  roomId: string;
  title: string;
  code: string;
  participantCount: number;
  createdAt: string;
  expiresAt: string;
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

function GhostRoomCard({ room }: { room: GhostRoomSummary }) {
  const [timeRemaining, setTimeRemaining] = useState("");

  useEffect(() => {
    function calc() {
      const diff = Math.max(0, new Date(room.expiresAt).getTime() - Date.now());
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setTimeRemaining(`${hours}h ${minutes}m`);
    }
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [room.expiresAt]);

  return (
    <Link href={`/ghost-rooms/${room.roomId}`}>
      <Card hover className="!p-5 cursor-pointer h-full !border-[#7C3AED] !shadow-[4px_4px_0_#7C3AED]">
        <div className="flex items-start justify-between mb-3">
          <Badge variant="info">Ghost</Badge>
          <span className="flex items-center gap-1 text-xs text-[#7C3AED] font-bold">
            <Clock size={12} /> {timeRemaining}
          </span>
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
          {room.title}
        </h3>
        <p className="text-xs text-[var(--text-secondary)] font-mono mb-3">{room.code}</p>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1"><Users size={12} /> {room.participantCount}</span>
        </div>
      </Card>
    </Link>
  );
}

export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "ghost">("upcoming");
  const [ghostRooms, setGhostRooms] = useState<GhostRoomSummary[]>([]);
  const [creatingGhost, setCreatingGhost] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    fetch("/api/ghost-rooms", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) setGhostRooms(data.data);
      })
      .catch(() => {});
  }, [user, retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError("");
    setRetryCount((c) => c + 1);
  };

  const handleInstantMeeting = async () => {
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Quick Meeting", type: "regular", settings: { allowRecording: false, allowScreenShare: true, waitingRoom: false, muteOnJoin: false } }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const id = data.data._id || data.data.id;
        router.push(`/meetings/${id}`);
      }
    } catch { /* ignore */ }
  };

  const handleCreateGhostRoom = async () => {
    if (creatingGhost) return;
    setCreatingGhost(true);
    try {
      const res = await fetch("/api/ghost-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Ghost Room" }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        router.push(`/ghost-rooms/${data.data.roomId}`);
      }
    } catch { /* ignore */ }
    finally { setCreatingGhost(false); }
  };

  // Split meetings into upcoming (scheduled/live) and past (ended/cancelled)
  // Past meetings only show for 24 hours — after that they're only in Meeting History
  // Capture "now" once on mount so the filter is stable across re-renders
  const [now] = useState(() => Date.now());
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const upcoming = meetings.filter((m) => m.status === "scheduled" || m.status === "live");
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

        {/* New Meeting dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-1.5 rounded-xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-4 py-2.5 text-sm font-bold text-[#0A0A0A] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all" style={{ fontFamily: "var(--font-heading)" }}>
              <Plus size={16} /> New Meeting <ChevronDown size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content sideOffset={8} align="end" className="z-50 min-w-[200px] bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-1.5">
              <DropdownMenu.Item onSelect={handleInstantMeeting} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none" style={{ fontFamily: "var(--font-heading)" }}>
                <Video size={14} /> Instant Meeting
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/meetings/new" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none" style={{ fontFamily: "var(--font-heading)" }}>
                  <Calendar size={14} /> Schedule Meeting
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenu.Item onSelect={handleCreateGhostRoom} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none" style={{ fontFamily: "var(--font-heading)" }}>
                <Ghost size={14} /> Ghost Room
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </motion.div>

      {/* Tab bar */}
      <motion.div variants={itemVariants} className="flex items-center gap-1 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1">
        {(["upcoming", "past", "ghost"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab
                ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {tab === "upcoming" ? "Upcoming" : tab === "past" ? "Past" : "Ghost Rooms"}
            {tab === "ghost" && ghostRooms.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold bg-[var(--surface-hover)] rounded-full px-1.5 py-0.5">
                {ghostRooms.length}
              </span>
            )}
          </button>
        ))}
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#FFE600] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {activeTab === "upcoming" && (
            upcoming.length > 0 ? (
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} />)}
              </motion.div>
            ) : (
              <EmptyState title="No upcoming meetings" description="Schedule a meeting or start an instant one." action={{ label: "Schedule Meeting", onClick: () => router.push("/meetings/new"), icon: Plus }} />
            )
          )}

          {activeTab === "past" && (
            past.length > 0 ? (
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {past.map((m) => <MeetingCard key={m.id} meeting={m} isPast />)}
              </motion.div>
            ) : (
              <EmptyState title="No past meetings" description="Your completed meetings will appear here." />
            )
          )}

          {activeTab === "ghost" && (
            ghostRooms.length > 0 ? (
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ghostRooms.map((r) => <GhostRoomCard key={r.roomId} room={r} />)}
              </motion.div>
            ) : (
              <EmptyState title="No ghost rooms" description="Create a ghost room for temporary, ephemeral meetings." action={{ label: "Create Ghost Room", onClick: handleCreateGhostRoom, icon: Ghost }} />
            )
          )}
        </>
      )}
    </motion.div>
  );
}

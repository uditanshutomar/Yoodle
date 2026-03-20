"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Plus, Calendar, Users, Clock, Ghost, ChevronDown, DoorOpen, LogIn, Repeat, MoreVertical, X as XIcon, CalendarClock, Trash2 } from "lucide-react";
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
  recurrence?: string;
  recurrenceDays?: string[];
  participantCount: number;
  createdAt: string;
  isHost: boolean;
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

function MeetingCard({
  meeting,
  isPast,
  onCancel,
  onDelete,
  onReschedule,
}: {
  meeting: MeetingSummary;
  isPast?: boolean;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReschedule?: (meeting: MeetingSummary) => void;
}) {
  const dateStr = meeting.scheduledAt || meeting.createdAt;

  return (
    <Card hover className="!p-5 h-full relative">
      {/* Action menu for host */}
      {meeting.isHost && (
        <div className="absolute top-3 right-3 z-10">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                onClick={(e) => e.preventDefault()}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                aria-label="Meeting actions"
              >
                <MoreVertical size={14} className="text-[var(--text-muted)]" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content sideOffset={4} align="end" className="z-50 min-w-[160px] bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-1.5">
                {!isPast && meeting.status === "scheduled" && (
                  <>
                    <DropdownMenu.Item
                      onSelect={() => onReschedule?.(meeting)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading"
                    >
                      <CalendarClock size={14} /> Reschedule
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => onCancel?.(meeting.id)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer outline-none font-heading"
                    >
                      <XIcon size={14} /> Cancel
                    </DropdownMenu.Item>
                  </>
                )}
                {(isPast || meeting.status === "cancelled" || meeting.status === "ended") && (
                  <DropdownMenu.Item
                    onSelect={() => onDelete?.(meeting.id)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer outline-none font-heading"
                  >
                    <Trash2 size={14} /> Delete
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}

      <Link href={isPast ? `/meetings/${meeting.id}/recording` : `/meetings/${meeting.id}`} className="block">
        <div className="flex items-start justify-between mb-3 pr-6">
          <Badge variant={statusColors[meeting.status] || "default"}>
            {meeting.status === "live" && (
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
            )}
            {meeting.status}
          </Badge>
          <div className="flex gap-1">
            {meeting.type === "ghost" && (
              <Badge variant="info">Ghost</Badge>
            )}
            {meeting.recurrence && meeting.recurrence !== "none" && (
              <Badge variant="info">
                <Repeat size={10} className="mr-1 inline" />
                {meeting.recurrence}
              </Badge>
            )}
          </div>
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 font-heading">
          {meeting.title}
        </h3>
        <p className="text-xs text-[var(--text-muted)] font-mono mb-3 font-body">
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
        {/* Show recurrence days */}
        {meeting.recurrenceDays && meeting.recurrenceDays.length > 0 && (
          <div className="flex gap-1 mt-2">
            {meeting.recurrenceDays.map((d) => (
              <span key={d} className="text-[10px] font-bold bg-[#FFE600]/30 text-[#0A0A0A] rounded-full w-5 h-5 flex items-center justify-center font-heading">
                {d.charAt(0)}
              </span>
            ))}
          </div>
        )}
      </Link>
    </Card>
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
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 font-heading">
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

// Reschedule modal
function RescheduleModal({
  meeting,
  onClose,
  onSave,
}: {
  meeting: MeetingSummary;
  onClose: () => void;
  onSave: (id: string, newDate: string) => void;
}) {
  const [newDate, setNewDate] = useState(
    meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toISOString().slice(0, 16)
      : ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newDate) return;
    setSaving(true);
    await onSave(meeting.id, new Date(newDate).toISOString());
    setSaving(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[6px_6px_0_var(--border-strong)] p-6 w-full max-w-sm mx-4"
      >
        <h3 className="text-lg font-black text-[var(--text-primary)] mb-1 font-heading">
          Reschedule Meeting
        </h3>
        <p className="text-sm text-[var(--text-muted)] mb-4 font-body">{meeting.title}</p>

        <label className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block font-heading">
          New Date & Time
        </label>
        <input
          type="datetime-local"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2.5 px-4 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none mb-4 font-body"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border-2 border-[var(--border)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-heading"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!newDate || saving}
            className="flex-1 py-2.5 rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] text-sm font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50 font-heading"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function MeetingsClient() {
  const router = useRouter();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "recurring">("upcoming");
  const [ghostRooms, setGhostRooms] = useState<GhostRoomSummary[]>([]);
  const [creatingGhost, setCreatingGhost] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<MeetingSummary | null>(null);

  useEffect(() => {
    fetch("/api/meetings", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
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
              recurrence: m.recurrence as string | undefined,
              recurrenceDays: m.recurrenceDays as string[] | undefined,
              participantCount: Array.isArray(m.participants) ? m.participants.length : 0,
              createdAt: m.createdAt as string,
              isHost: (() => {
                const hostId = m.hostId as Record<string, unknown> | string | undefined;
                if (!hostId) return false;
                const hid = typeof hostId === "string" ? hostId : (hostId._id as string) || "";
                return hid === user?.id;
              })(),
            }))
          );
          setError("");
        } else {
          setError(data.error?.message || "Failed to load meetings");
        }
      })
      .catch(() => setError("Something went wrong. Please try again."))
      .finally(() => setLoading(false));
  }, [retryCount, user?.id]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/ghost-rooms", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.success && data.data) setGhostRooms(data.data);
      })
      .catch((err) => console.warn("[Meetings] Ghost rooms fetch failed:", err));
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
        body: JSON.stringify({ title: "Quick Meeting", type: "regular", settings: { allowRecording: true, allowScreenShare: true, waitingRoom: false, muteOnJoin: false } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        const id = data.data._id || data.data.id;
        router.push(`/meetings/${id}`);
      } else {
        setError(data.error?.message || "Failed to create instant meeting");
      }
    } catch {
      setError("Failed to create meeting. Check your connection.");
    }
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        router.push(`/ghost-rooms/${data.data.roomId}`);
      } else {
        setError(data.error?.message || "Failed to create ghost room");
      }
    } catch {
      setError("Failed to create ghost room. Check your connection.");
    }
    finally { setCreatingGhost(false); }
  };

  const handleJoin = () => {
    const code = joinCode.trim();
    if (!code) return;
    router.push(`/meetings/join?code=${encodeURIComponent(code)}`);
  };

  const handleCancel = useCallback(async (meetingId: string) => {
    if (!confirm("Cancel this meeting? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || "Failed to cancel meeting");
        return;
      }
      setMeetings((prev) => prev.map((m) => m.id === meetingId ? { ...m, status: "cancelled" } : m));
    } catch {
      setError("Failed to cancel meeting. Check your connection.");
    }
  }, []);

  const handleDelete = useCallback(async (meetingId: string) => {
    if (!confirm("Delete this meeting permanently?")) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || "Failed to delete meeting");
        return;
      }
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    } catch {
      setError("Failed to delete meeting. Check your connection.");
    }
  }, []);

  const handleReschedule = useCallback(async (meetingId: string, newDate: string) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scheduledAt: newDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || "Failed to reschedule meeting");
        return;
      }
      setMeetings((prev) => prev.map((m) => m.id === meetingId ? { ...m, scheduledAt: newDate } : m));
      setRescheduleTarget(null);
    } catch {
      setError("Failed to reschedule meeting. Check your connection.");
    }
  }, []);

  // Split meetings into upcoming, past, and recurring
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const upcoming = meetings.filter((m) => {
    if (m.recurrence && m.recurrence !== "none") return false; // recurring has its own tab
    if (m.status === "live") return true;
    if (m.status === "scheduled") {
      const dateStr = m.scheduledAt || m.createdAt;
      return new Date(dateStr).getTime() + ONE_HOUR > now;
    }
    return false;
  });
  const past = meetings.filter((m) => {
    if (m.recurrence && m.recurrence !== "none") return false; // recurring has its own tab
    if (m.status === "ended" || m.status === "cancelled") return true;
    if (m.status === "scheduled") {
      const dateStr = m.scheduledAt || m.createdAt;
      return new Date(dateStr).getTime() + ONE_HOUR <= now;
    }
    return false;
  });
  const recurring = meetings.filter((m) => m.recurrence && m.recurrence !== "none");

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Page Header */}
      <motion.div variants={itemVariants}>
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight font-heading"
          style={{ textShadow: "2px 2px 0 #FFE600" }}
        >
          Rooms
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] font-body">
          Start, join, and revisit your meeting rooms
        </p>
      </motion.div>

      {/* Action Buttons: Start a Room + Join a Room */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Start a Room */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex items-center gap-3 rounded-2xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-6 py-4 shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-left w-full font-heading"
            >
              <DoorOpen size={20} className="text-[#0A0A0A] flex-shrink-0" />
              <span className="text-base font-bold text-[#0A0A0A]">Start a Room</span>
              <ChevronDown size={14} className="ml-auto text-[#0A0A0A]" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content sideOffset={8} align="start" className="z-50 min-w-[200px] bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-1.5">
              <DropdownMenu.Item onSelect={handleInstantMeeting} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading">
                <Video size={14} /> Instant Meeting
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/meetings/new" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading">
                  <Calendar size={14} /> Schedule Meeting
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/meetings/new?recurring=true" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading">
                  <Repeat size={14} /> Recurring Meeting
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
              <DropdownMenu.Item onSelect={handleCreateGhostRoom} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading">
                <Ghost size={14} /> Ghost Room
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Join a Room */}
        <div className="flex items-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
          <div className="flex-1 flex items-center gap-3 px-5 py-4">
            <LogIn size={18} className="text-[var(--text-secondary)] flex-shrink-0" />
            <label htmlFor="join-room-code" className="sr-only">Room code</label>
            <input
              id="join-room-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Enter room code"
              aria-label="Enter room code to join a meeting"
              className="bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] w-full font-body"
            />
          </div>
          <button
            onClick={handleJoin}
            className="h-full bg-[var(--foreground)] px-6 py-4 text-sm font-bold text-[var(--background)] border-l-2 border-[var(--border-strong)] hover:opacity-90 transition-opacity font-heading"
          >
            Join
          </button>
        </div>
      </motion.div>

      {/* Tab bar */}
      <motion.div variants={itemVariants} className="flex items-center gap-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1">
        {(["upcoming", "past", "recurring"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab
                ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            } font-heading`}
          >
            {tab === "upcoming" ? "Upcoming" : tab === "past" ? "Past" : "Recurring"}
          </button>
        ))}
      </motion.div>

      {/* Error banner */}
      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-[#FF6B6B]/10 border-2 border-[#FF6B6B] rounded-xl px-4 py-3 flex items-center justify-between"
        >
          <p className="text-sm font-bold text-[#FF6B6B] font-heading">
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="text-sm font-bold text-[#FF6B6B] underline cursor-pointer hover:text-[#FF6B6B]/80 transition-colors font-heading"
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
            <>
              {/* Ghost rooms inline */}
              {ghostRooms.length > 0 && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ghostRooms.map((r) => <GhostRoomCard key={r.roomId} room={r} />)}
                </motion.div>
              )}
              {upcoming.length > 0 ? (
                <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcoming.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      onCancel={handleCancel}
                      onReschedule={setRescheduleTarget}
                    />
                  ))}
                </motion.div>
              ) : ghostRooms.length === 0 ? (
                <EmptyState title="No upcoming rooms" description="Schedule a meeting or start an instant one." action={{ label: "Start a Room", onClick: () => router.push("/meetings/new"), icon: Plus }} />
              ) : null}
            </>
          )}

          {activeTab === "past" && (
            past.length > 0 ? (
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {past.map((m) => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    isPast
                    onDelete={handleDelete}
                  />
                ))}
              </motion.div>
            ) : (
              <EmptyState title="No past meetings" description="Your completed meetings will appear here." />
            )
          )}

          {activeTab === "recurring" && (
            recurring.length > 0 ? (
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recurring.map((m) => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    onCancel={handleCancel}
                    onReschedule={setRescheduleTarget}
                    onDelete={handleDelete}
                  />
                ))}
              </motion.div>
            ) : (
              <EmptyState
                title="No recurring meetings"
                description="Set up meetings that repeat on a schedule."
                action={{ label: "Create Recurring Meeting", onClick: () => router.push("/meetings/new?recurring=true"), icon: Repeat }}
              />
            )
          )}
        </>
      )}

      {/* Reschedule modal */}
      <AnimatePresence>
        {rescheduleTarget && (
          <RescheduleModal
            meeting={rescheduleTarget}
            onClose={() => setRescheduleTarget(null)}
            onSave={handleReschedule}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

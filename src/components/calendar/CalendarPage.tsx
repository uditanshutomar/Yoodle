"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  RefreshCw,
  Clock,
  MapPin,
  Users,
  Video,
  ExternalLink,
  Plus,
  X,
  Loader2,
  Trash2,
  Pencil,
  Link2,
  FileText,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { useCalendarAssist } from "./useCalendarAssist";
import { AISuggestionChips } from "./AISuggestionChips";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location?: string;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  meetLink?: string;
  htmlLink?: string;
  status: string;
}

interface UserSuggestion {
  _id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface AttendeeEntry {
  type: "user" | "email";
  userId?: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

type ViewMode = "week" | "day";

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEventTop(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function getEventHeight(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const mins = (e.getTime() - s.getTime()) / 60000;
  return Math.max(mins, 20); // minimum 20 min height
}

const pad = (n: number) => n.toString().padStart(2, "0");

const HOUR_HEIGHT = 60; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="flex-1 h-10 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
      </div>
      <div className="h-[500px] animate-pulse rounded-2xl bg-[var(--surface-hover)]" />
    </div>
  );
}

/* ── Event Detail Modal ───────────────────────────── */

function EventDetailModal({
  event,
  onClose,
  onDeleted,
  onEdit,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onDeleted: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/calendar/events?eventId=${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || data.error || `Failed (${res.status})`);
      }
      onDeleted();
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const responseStatusLabel = (status?: string) => {
    switch (status) {
      case "accepted": return "Accepted";
      case "declined": return "Declined";
      case "tentative": return "Maybe";
      case "needsAction": return "Pending";
      default: return status || "Invited";
    }
  };

  const responseStatusColor = (status?: string) => {
    switch (status) {
      case "accepted": return "text-green-600 bg-green-50";
      case "declined": return "text-[#FF6B6B] bg-[#FF6B6B]/10";
      case "tentative": return "text-yellow-600 bg-yellow-50";
      default: return "text-[var(--text-muted)] bg-[var(--surface-hover)]";
    }
  };

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-md rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[6px_6px_0_var(--border-strong)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b-2 border-[var(--border-strong)] px-5 py-4">
                <div className="flex-1 min-w-0 pr-3">
                  <h2 className="text-lg font-black text-[var(--text-primary)] font-heading leading-tight">
                    {event.title}
                  </h2>
                  {event.status === "cancelled" && (
                    <span className="inline-block mt-1 text-[10px] font-bold text-[#FF6B6B] bg-[#FF6B6B]/10 px-2 py-0.5 rounded-full font-heading">
                      Cancelled
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                {/* Time */}
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-[var(--text-muted)] shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
                      {formatTime(event.start)} – {formatTime(event.end)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-body">
                      {new Date(event.start).toLocaleDateString([], {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                {/* Location */}
                {event.location && (
                  <div className="flex items-center gap-2.5">
                    <MapPin size={16} className="text-[var(--text-muted)] shrink-0" />
                    <p className="text-sm text-[var(--text-primary)] font-body">
                      {event.location}
                    </p>
                  </div>
                )}

                {/* Yoodle Room link (priority) or Meet link (fallback) */}
                {(() => {
                  const yoodleLink = extractYoodleLink(event);
                  if (yoodleLink) {
                    return (
                      <div className="flex items-center gap-2.5">
                        <Video size={16} className="text-[var(--text-muted)] shrink-0" />
                        <a
                          href={yoodleLink}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFE600]/20 border border-[#FFE600]/40 px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[#FFE600]/30 transition-colors font-heading"
                        >
                          <Video size={12} />
                          Join Yoodle Room
                        </a>
                      </div>
                    );
                  }
                  if (event.meetLink) {
                    return (
                      <div className="flex items-center gap-2.5">
                        <Video size={16} className="text-[var(--text-muted)] shrink-0" />
                        <a
                          href={event.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors font-heading"
                        >
                          <ExternalLink size={12} />
                          Google Meet
                        </a>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Agenda */}
                {event.description && parseAgenda(event.description) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={16} className="text-[var(--text-muted)] shrink-0" />
                      <span className="text-xs font-bold text-[var(--text-secondary)] font-heading">
                        Agenda
                      </span>
                    </div>
                    <div className="ml-6 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2.5">
                      <p className="text-xs text-[var(--text-secondary)] font-body whitespace-pre-wrap">
                        {parseAgenda(event.description)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Reference Links */}
                {event.description && parseReferenceLinks(event.description).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 size={16} className="text-[var(--text-muted)] shrink-0" />
                      <span className="text-xs font-bold text-[var(--text-secondary)] font-heading">
                        Reference Links
                      </span>
                    </div>
                    <div className="ml-6 space-y-1.5">
                      {parseReferenceLinks(event.description).map((link, i) => (
                        <a
                          key={i}
                          href={link.startsWith("http") ? link : `https://${link}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[#FFE600] hover:underline font-body truncate"
                        >
                          <ExternalLink size={10} className="shrink-0" />
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description (raw, only if no structured agenda) */}
                {event.description && !parseAgenda(event.description) && parseReferenceLinks(event.description).length === 0 && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2.5">
                    <p className="text-xs text-[var(--text-secondary)] font-body whitespace-pre-wrap line-clamp-6">
                      {event.description}
                    </p>
                  </div>
                )}

                {/* Attendees */}
                {event.attendees.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="text-[var(--text-muted)] shrink-0" />
                      <span className="text-xs font-bold text-[var(--text-secondary)] font-heading">
                        {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="space-y-1.5 ml-6">
                      {event.attendees.slice(0, 8).map((a, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--text-primary)] truncate font-body">
                            {a.name || a.email}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 font-heading ${responseStatusColor(a.responseStatus)}`}>
                            {responseStatusLabel(a.responseStatus)}
                          </span>
                        </div>
                      ))}
                      {event.attendees.length > 8 && (
                        <p className="text-[10px] text-[var(--text-muted)] font-body">
                          +{event.attendees.length - 8} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Google Calendar link */}
                {event.htmlLink && (
                  <a
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[#FFE600] transition-colors font-heading"
                  >
                    <ExternalLink size={12} />
                    Open in Google Calendar
                  </a>
                )}

                {/* Delete error */}
                {deleteError && (
                  <p className="text-xs font-bold text-[#FF6B6B] font-body">
                    {deleteError}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t-2 border-[var(--border)] px-5 py-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-[#FF6B6B]/30 px-3 py-2 text-xs font-bold text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer disabled:opacity-50 font-heading"
                >
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { onEdit(event); onClose(); }}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-heading"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-xl border-2 border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-heading"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Compact Event Card (week view) ───────────────── */

function CompactEventCard({
  event,
  onEventClick,
}: {
  event: CalendarEvent;
  onEventClick: (event: CalendarEvent) => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
      className="w-full text-left rounded-lg border-2 border-[var(--border-strong)] bg-[#FFE600]/15 px-2 py-1.5 hover:bg-[#FFE600]/25 transition-colors group cursor-pointer"
    >
      <p className="text-[11px] font-bold text-[var(--text-primary)] truncate font-heading">
        {event.title}
      </p>
      <p className="text-[10px] text-[var(--text-muted)] font-body">
        {formatTime(event.start)}
      </p>
    </button>
  );
}

/* ── Day View Event Card ──────────────────────────── */

function DayEventCard({
  event,
  onEventClick,
}: {
  event: CalendarEvent;
  onEventClick: (event: CalendarEvent) => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onEventClick(event)}
      className="w-full h-full text-left rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[3px_3px_0_var(--border-strong)] overflow-hidden cursor-pointer hover:border-[#FFE600] transition-colors"
    >
      <div className="border-l-4 border-[#FFE600] px-3 py-2.5 h-full">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)] font-heading leading-tight">
            {event.title}
          </h3>
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[var(--text-muted)] hover:text-[#FFE600] transition-colors"
              title="Open in Google Calendar"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] font-body">
            <Clock size={11} className="text-[var(--text-muted)]" />
            {formatTime(event.start)} – {formatTime(event.end)}
          </span>

          {event.location && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] font-body">
              <MapPin size={11} className="text-[var(--text-muted)]" />
              <span className="truncate max-w-[140px]">{event.location}</span>
            </span>
          )}

          {event.attendees.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)] font-body">
              <Users size={11} className="text-[var(--text-muted)]" />
              {event.attendees.length}
            </span>
          )}
        </div>

        {(() => {
          const yoodleLink = extractYoodleLink(event);
          if (yoodleLink) {
            return (
              <a
                href={yoodleLink}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#FFE600]/20 border border-[#FFE600]/40 px-2.5 py-1 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[#FFE600]/30 transition-colors font-heading"
                onClick={(e) => e.stopPropagation()}
              >
                <Video size={11} />
                Join Yoodle Room
              </a>
            );
          }
          if (event.meetLink) {
            return (
              <a
                href={event.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors font-heading"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={11} />
                Google Meet
              </a>
            );
          }
          return null;
        })()}
      </div>
    </motion.button>
  );
}

/* ── Attendee Input with Autocomplete ────────────────── */

function AttendeeInput({
  attendees,
  onChange,
}: {
  attendees: AttendeeEntry[];
  onChange: (attendees: AttendeeEntry[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Search users as the user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query.trim())}&limit=6`,
          { credentials: "include" }
        );
        if (res.ok) {
          const json = await res.json();
          const results: UserSuggestion[] = json.data || [];
          // Filter out already-added users
          const existingIds = new Set(attendees.filter((a) => a.userId).map((a) => a.userId));
          setSuggestions(results.filter((u) => !existingIds.has(u._id)));
          setShowDropdown(true);
        }
      } catch {
        // Silently fail — user can always type email
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, attendees]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addUser = (user: UserSuggestion) => {
    onChange([
      ...attendees,
      {
        type: "user",
        userId: user._id,
        name: user.displayName || user.name,
        avatarUrl: user.avatarUrl,
      },
    ]);
    setQuery("");
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const addEmail = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    // Don't add duplicates
    if (attendees.some((a) => a.email === trimmed)) return;
    onChange([...attendees, { type: "email", name: trimmed, email: trimmed }]);
    setQuery("");
    inputRef.current?.focus();
  };

  const removeAttendee = (index: number) => {
    onChange(attendees.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (query.trim().includes("@")) {
        addEmail(query);
      }
    }
    if (e.key === "Backspace" && !query && attendees.length > 0) {
      removeAttendee(attendees.length - 1);
    }
  };

  return (
    <div className="relative">
      {/* Chips + input */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-2.5 py-2 min-h-[42px] focus-within:ring-2 focus-within:ring-[#FFE600]">
        {attendees.map((a, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2 py-0.5 text-xs font-bold text-[var(--text-primary)] font-heading"
          >
            {a.type === "user" && a.avatarUrl ? (
              <img
                src={a.avatarUrl}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
              />
            ) : (
              <UserPlus size={10} className="text-[var(--text-muted)]" />
            )}
            {a.name}
            <button
              type="button"
              onClick={() => removeAttendee(i)}
              className="ml-0.5 text-[var(--text-muted)] hover:text-[#FF6B6B] cursor-pointer"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={
            attendees.length === 0
              ? "Search names or type email..."
              : "Add more..."
          }
          className="flex-1 min-w-[120px] bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body outline-none"
        />
        {searching && (
          <Loader2
            size={14}
            className="animate-spin text-[var(--text-muted)] self-center shrink-0"
          />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden"
        >
          {suggestions.map((user) => (
            <button
              key={user._id}
              type="button"
              onClick={() => addUser(user)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-[#FFE600]/10 transition-colors cursor-pointer"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover border border-[var(--border)]"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-hover)] border border-[var(--border)]">
                  <Users size={12} className="text-[var(--text-muted)]" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate font-heading">
                  {user.displayName || user.name}
                </p>
                {user.displayName && user.name !== user.displayName && (
                  <p className="text-[10px] text-[var(--text-muted)] truncate font-body">
                    {user.name}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="mt-1 text-[10px] text-[var(--text-muted)] font-body">
        Search Yoodle users by name or type an email and press Enter
      </p>
    </div>
  );
}

/* ── Create Event Modal ────────────────────────────── */

interface CreateEventForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: AttendeeEntry[];
  createYoodleRoom: boolean;
  agenda: string;
  referenceLinks: string;
}

function getDefaultForm(prefillDate?: Date, prefillHour?: number): CreateEventForm {
  const base = prefillDate || new Date();
  const startHour = prefillHour ?? base.getHours() + 1;
  const endHour = startHour + 1;

  return {
    title: "",
    date: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`,
    startTime: `${pad(startHour % 24)}:00`,
    endTime: `${pad(endHour % 24)}:00`,
    location: "",
    attendees: [],
    createYoodleRoom: false,
    agenda: "",
    referenceLinks: "",
  };
}

/** Extract Yoodle meeting link from event description or location */
function extractYoodleLink(event: CalendarEvent): string | null {
  const pattern = /https?:\/\/[^\s]+\/meetings\/yoo-[a-z0-9]+-[a-z0-9]+\/room/i;
  if (event.location) {
    const match = event.location.match(pattern);
    if (match) return match[0];
  }
  if (event.description) {
    const match = event.description.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** Parse agenda from event description (between markers) */
function parseAgenda(description: string): string | null {
  const match = description.match(/--- Agenda ---\n([\s\S]*?)(?:\n--- Reference Links ---|$)/);
  return match ? match[1].trim() : null;
}

/** Parse reference links from event description */
function parseReferenceLinks(description: string): string[] {
  const match = description.match(/--- Reference Links ---\n([\s\S]*?)$/);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

function CreateEventModal({
  open,
  onClose,
  onCreated,
  prefillDate,
  prefillHour,
  editEvent,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  prefillDate?: Date;
  prefillHour?: number;
  editEvent?: CalendarEvent | null;
}) {
  const [form, setForm] = useState<CreateEventForm>(() => getDefaultForm(prefillDate, prefillHour));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const assist = useCalendarAssist();
  const prevAttendeeCount = useRef(0);

  const isEditing = !!editEvent;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (editEvent) {
        const s = new Date(editEvent.start);
        const e = new Date(editEvent.end);
        const existingAgenda = editEvent.description ? parseAgenda(editEvent.description) : null;
        const existingLinks = editEvent.description ? parseReferenceLinks(editEvent.description) : [];
        setForm({
          title: editEvent.title,
          date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
          startTime: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
          endTime: `${pad(e.getHours())}:${pad(e.getMinutes())}`,
          location: editEvent.location || "",
          attendees: editEvent.attendees.map((a) => ({
            type: "email" as const,
            name: a.name || a.email,
            email: a.email,
          })),
          createYoodleRoom: !!extractYoodleLink(editEvent),
          agenda: existingAgenda || "",
          referenceLinks: existingLinks.join("\n"),
        });
      } else {
        setForm(getDefaultForm(prefillDate, prefillHour));
      }
      setError(null);
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open, prefillDate, prefillHour, editEvent]);

  useEffect(() => {
    if (!open) assist.reset();
  }, [open]);

  useEffect(() => {
    if (assist.suggestYoodleRoom && !form.createYoodleRoom && !isEditing) {
      update("createYoodleRoom", true);
    }
  }, [assist.suggestYoodleRoom]);

  useEffect(() => {
    const count = form.attendees.length;
    if (count > 0 && count !== prevAttendeeCount.current && form.title.trim().length >= 3) {
      prevAttendeeCount.current = count;
      const attendeeIds = form.attendees.filter((a) => a.userId).map((a) => a.userId!);
      assist.clearDownstream("attendees");
      assist.fetchAgendaSuggestions(form.title, attendeeIds);
    }
  }, [form.attendees.length]);

  const update = (field: keyof CreateEventForm, value: string | boolean | AttendeeEntry[]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const start = new Date(`${form.date}T${form.startTime}:00`);
      const end = new Date(`${form.date}T${form.endTime}:00`);

      if (end <= start) {
        setError("End time must be after start time");
        setSubmitting(false);
        return;
      }

      // Separate user IDs and email-only attendees
      const emailAttendees = form.attendees
        .filter((a) => a.type === "email" && a.email)
        .map((a) => a.email!);
      const userIdAttendees = form.attendees
        .filter((a) => a.type === "user" && a.userId)
        .map((a) => a.userId!);

      // Build description with agenda and reference links
      const descriptionParts: string[] = [];
      if (form.agenda.trim()) {
        descriptionParts.push(`--- Agenda ---\n${form.agenda.trim()}`);
      }
      const links = form.referenceLinks
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (links.length > 0) {
        descriptionParts.push(`--- Reference Links ---\n${links.map((l) => `- ${l}`).join("\n")}`);
      }
      const description = descriptionParts.join("\n\n");

      if (isEditing && editEvent) {
        // Update existing event via PATCH
        const body: Record<string, unknown> = {
          eventId: editEvent.id,
          title: form.title.trim(),
          start: start.toISOString(),
          end: end.toISOString(),
        };
        if (form.location.trim()) body.location = form.location.trim();
        if (emailAttendees.length > 0) body.attendees = emailAttendees;
        if (description) body.description = description;

        const res = await fetch("/api/calendar/events", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error?.message || data.error || `Failed (${res.status})`);
        }
      } else if (form.createYoodleRoom) {
        // Create a Yoodle meeting (which auto-creates calendar event)
        const durationMinutes = Math.round(
          (end.getTime() - start.getTime()) / 60000
        );

        const meetingBody: Record<string, unknown> = {
          title: form.title.trim(),
          scheduledAt: start.toISOString(),
          description: description || undefined,
          settings: { maxParticipants: 25 },
        };
        if (durationMinutes > 0) meetingBody.scheduledDuration = durationMinutes;

        const res = await fetch("/api/meetings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(meetingBody),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error?.message || data.error || `Failed (${res.status})`);
        }
      } else {
        // Create plain calendar event via POST
        const body: Record<string, unknown> = {
          title: form.title.trim(),
          start: start.toISOString(),
          end: end.toISOString(),
          addMeetLink: false,
        };
        if (form.location.trim()) body.location = form.location.trim();
        if (emailAttendees.length > 0) body.attendees = emailAttendees;
        if (userIdAttendees.length > 0) body.attendeeUserIds = userIdAttendees;
        if (description) body.description = description;

        const res = await fetch("/api/calendar/events", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error?.message || data.error || `Failed (${res.status})`);
        }
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-lg rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[6px_6px_0_var(--border-strong)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-5 py-4">
                <h2 className="text-lg font-black text-[var(--text-primary)] font-heading">
                  {isEditing ? "Edit Event" : "New Event"}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                    Title *
                  </label>
                  <div className="relative">
                    <input
                      ref={titleRef}
                      type="text"
                      value={form.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        update("title", val);
                        assist.clearDownstream("title");
                        assist.fetchTitleSuggestions(val);
                      }}
                      onBlur={() => {
                        if (form.title.trim().length >= 3) {
                          const existingIds = form.attendees.filter((a) => a.userId).map((a) => a.userId!);
                          assist.fetchAttendeeSuggestions(form.title, existingIds);
                        }
                      }}
                      placeholder="Team standup, 1:1 with Alex..."
                      className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                    />
                    {(assist.titles.length > 0 || assist.loading.titles) && (
                      <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[3px_3px_0_0_#FFE600] overflow-hidden max-h-48 overflow-y-auto">
                        {assist.loading.titles && assist.titles.length === 0 && (
                          <div className="px-3 py-2 text-xs text-[var(--text-muted)] animate-pulse font-body">
                            <Sparkles className="inline h-3 w-3 mr-1" />
                            Thinking...
                          </div>
                        )}
                        {assist.titles.map((t, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              update("title", t.value);
                              assist.dismissAllForField("titles");
                              const existingIds = form.attendees.filter((a) => a.userId).map((a) => a.userId!);
                              assist.fetchAttendeeSuggestions(t.value, existingIds);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-[#FFE600]/20 transition-colors border-b last:border-b-0 border-[var(--border)] cursor-pointer"
                          >
                            <div className="text-sm font-medium text-[var(--text-primary)] font-body">{t.value}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-body">{t.reason}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Date + Times */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                      Date
                    </label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => update("date", e.target.value)}
                      className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                      Start
                    </label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => update("startTime", e.target.value)}
                      className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                      End
                    </label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => update("endTime", e.target.value)}
                      className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                    Location
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="Office, Zoom link, etc."
                    className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                  />
                </div>

                {/* Attendees */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                    <span className="flex items-center gap-1.5">
                      <Users size={12} />
                      Attendees
                    </span>
                  </label>
                  <AttendeeInput
                    attendees={form.attendees}
                    onChange={(a) => update("attendees", a)}
                  />
                  <AISuggestionChips
                    suggestions={assist.attendees.map((a) => ({
                      label: a.displayName || a.name,
                      sublabel: a.name,
                      avatarUrl: a.avatarUrl,
                      icon: "user" as const,
                      reason: a.reason,
                    }))}
                    loading={assist.loading.attendees}
                    onAccept={(i) => {
                      const s = assist.attendees[i];
                      if (!s) return;
                      const updated: AttendeeEntry[] = [
                        ...form.attendees,
                        { type: "user", userId: s.userId, name: s.displayName || s.name, avatarUrl: s.avatarUrl },
                      ];
                      update("attendees", updated);
                      assist.dismissAttendee(s.userId);
                    }}
                    onDismiss={(i) => {
                      const s = assist.attendees[i];
                      if (s) assist.dismissAttendee(s.userId);
                    }}
                    onDismissAll={() => assist.dismissAllForField("attendees")}
                    label="Suggested Attendees"
                  />
                </div>

                {/* Agenda */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                    <span className="flex items-center gap-1.5">
                      <FileText size={12} />
                      Meeting Agenda
                    </span>
                  </label>
                  <textarea
                    value={form.agenda}
                    onChange={(e) => update("agenda", e.target.value)}
                    placeholder="1. Review last sprint&#10;2. Demo new features&#10;3. Plan next steps..."
                    rows={3}
                    className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none resize-none"
                  />
                  <AISuggestionChips
                    suggestions={assist.agenda.map((a) => ({
                      label: a.value,
                      icon: "agenda" as const,
                      reason: a.reason,
                    }))}
                    loading={assist.loading.agenda}
                    onAccept={(i) => {
                      const item = assist.agenda[i];
                      if (!item) return;
                      const newAgenda = form.agenda ? `${form.agenda}\n• ${item.value}` : `• ${item.value}`;
                      update("agenda", newAgenda);
                      assist.dismissAgenda(i);
                      const attendeeIds = form.attendees.filter((a) => a.userId).map((a) => a.userId!);
                      assist.fetchReferenceSuggestions(form.title, attendeeIds, newAgenda);
                    }}
                    onDismiss={(i) => assist.dismissAgenda(i)}
                    onDismissAll={() => assist.dismissAllForField("agenda")}
                    label="Suggested Agenda Items"
                  />
                </div>

                {/* Reference Links */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 font-heading">
                    <span className="flex items-center gap-1.5">
                      <Link2 size={12} />
                      Reference Links
                    </span>
                  </label>
                  <textarea
                    value={form.referenceLinks}
                    onChange={(e) => update("referenceLinks", e.target.value)}
                    placeholder="Paste Google Drive, Docs, or any reference URLs (one per line)&#10;https://drive.google.com/..."
                    rows={2}
                    className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none resize-none"
                  />
                  <p className="mt-1 text-[10px] text-[var(--text-muted)] font-body">
                    One link per line — Google Drive, Sheets, Slides, Docs, etc.
                  </p>
                  <AISuggestionChips
                    suggestions={assist.references.map((r) => ({
                      label: r.title,
                      icon: r.type as "doc" | "sheet" | "slide" | "pdf" | "file",
                      reason: r.reason,
                    }))}
                    loading={assist.loading.references}
                    onAccept={(i) => {
                      const ref = assist.references[i];
                      if (!ref) return;
                      const newLinks = form.referenceLinks ? `${form.referenceLinks}\n${ref.url}` : ref.url;
                      update("referenceLinks", newLinks);
                      assist.dismissReference(i);
                    }}
                    onDismiss={(i) => assist.dismissReference(i)}
                    onDismissAll={() => assist.dismissAllForField("references")}
                    label="Suggested Documents"
                  />
                </div>

                {/* Yoodle Room toggle — only for new events */}
                {!isEditing && (
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div
                      className={`relative h-6 w-11 rounded-full border-2 transition-colors ${
                        form.createYoodleRoom
                          ? "bg-[#FFE600] border-[var(--border-strong)]"
                          : "bg-[var(--surface-hover)] border-[var(--border)]"
                      }`}
                      onClick={() => update("createYoodleRoom", !form.createYoodleRoom)}
                    >
                      <div
                        className={`absolute top-0.5 h-4 w-4 rounded-full border border-[var(--border-strong)] bg-white shadow-sm transition-transform ${
                          form.createYoodleRoom ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                    <span className="text-sm font-bold text-[var(--text-primary)] font-heading flex items-center gap-1.5">
                      <Video size={14} className="text-[var(--text-muted)]" />
                      Create Yoodle Room
                    </span>
                    {assist.yoodleRoomReason && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5 font-body">
                        <Sparkles className="h-2.5 w-2.5" />
                        {assist.yoodleRoomReason}
                      </span>
                    )}
                  </label>
                )}

                {error && (
                  <p className="text-xs font-bold text-[#FF6B6B] font-body">
                    {error}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t-2 border-[var(--border)] px-5 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border-2 border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-heading"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.title.trim()}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 cursor-pointer font-heading"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isEditing ? (
                    <Pencil size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                  {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Event"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Main Calendar Page ────────────────────────────── */

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("week");
  const [googleConnected, setGoogleConnected] = useState(true);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPrefillDate, setCreatePrefillDate] = useState<Date | undefined>();
  const [createPrefillHour, setCreatePrefillHour] = useState<number | undefined>();
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "week") {
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 7);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    try {
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults: "100",
      });

      const res = await fetch(`/api/calendar/events?${params}`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      if (res.status === 403) {
        setGoogleConnected(false);
        setEvents([]);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(`Failed to load (${res.status})`);

      const json = await res.json();
      if (!mountedRef.current) return;

      setGoogleConnected(true);
      setEvents(json.data || []);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [currentDate, view]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const navigateDate = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (view === "week") {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setDate(next.getDate() + direction);
    }
    setCurrentDate(next);
  };

  const goToToday = () => setCurrentDate(new Date());

  const weekDays = getWeekDays(currentDate);
  const today = new Date();

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.start), day));

  // Open create modal with specific date/time
  const openCreateForSlot = (date: Date, hour?: number) => {
    setEditEvent(null);
    setCreatePrefillDate(date);
    setCreatePrefillHour(hour);
    setShowCreateModal(true);
  };

  // Open create modal for editing
  const openEditModal = (event: CalendarEvent) => {
    setEditEvent(event);
    setCreatePrefillDate(undefined);
    setCreatePrefillHour(undefined);
    setShowCreateModal(true);
  };

  const headerLabel =
    view === "week"
      ? `${weekDays[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
      : currentDate.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight font-heading"
          style={{ textShadow: "2px 2px 0 #FFE600" }}
        >
          Calendar
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] font-body">
          Your schedule synced from Google Calendar
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Navigation */}
        <div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1">
          <button
            onClick={() => navigateDate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            aria-label={view === "week" ? "Previous week" : "Previous day"}
          >
            <ChevronLeft size={16} className="text-[var(--text-secondary)]" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-heading"
          >
            Today
          </button>
          <button
            onClick={() => navigateDate(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            aria-label={view === "week" ? "Next week" : "Next day"}
          >
            <ChevronRight size={16} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Date label */}
        <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] font-heading">
          {headerLabel}
        </h2>

        <div className="ml-auto flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1">
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                view === "week"
                  ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              } font-heading`}
            >
              Week
            </button>
            <button
              onClick={() => setView("day")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                view === "day"
                  ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              } font-heading`}
            >
              Day
            </button>
          </div>

          {/* New Event */}
          {googleConnected && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => openCreateForSlot(currentDate)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-3 py-1.5 text-xs font-bold text-[#0A0A0A] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer font-heading"
            >
              <Plus size={14} />
              New Event
            </motion.button>
          )}

          {/* Refresh */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchEvents}
            className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            aria-label="Refresh"
          >
            <RefreshCw
              size={14}
              className={`text-[var(--text-muted)] ${loading ? "animate-spin" : ""}`}
            />
          </motion.button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <CalendarSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="rounded-2xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-6 py-4 text-center">
            <p className="text-sm font-bold text-[#FF6B6B] mb-3 font-heading">
              {error}
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={fetchEvents}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6B6B] bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 rounded-xl px-4 py-2 hover:bg-[#FF6B6B]/20 transition-colors font-heading cursor-pointer"
            >
              <RefreshCw size={14} /> Retry
            </motion.button>
          </div>
        </div>
      ) : !googleConnected ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
            <CalendarIcon size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
            Google Calendar not connected
          </p>
          <p className="text-xs text-[var(--text-muted)] text-center max-w-xs font-body">
            Connect your Google account in{" "}
            <a
              href="/settings"
              className="text-[#FFE600] font-bold hover:underline"
            >
              Settings
            </a>{" "}
            to see your calendar events here.
          </p>
        </div>
      ) : view === "week" ? (
        /* ── Week View ─────────────────────────────────────── */
        <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b-2 border-[var(--border-strong)]">
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, today);
              const dayEvents = getEventsForDay(day);
              return (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentDate(day);
                    setView("day");
                  }}
                  className={`flex flex-col items-center py-3 cursor-pointer transition-colors hover:bg-[var(--surface-hover)] ${
                    i < 6 ? "border-r border-[var(--border)]" : ""
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-heading">
                    {day.toLocaleDateString([], { weekday: "short" })}
                  </span>
                  <span
                    className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold font-heading ${
                      isToday
                        ? "bg-[#FFE600] text-[#0A0A0A]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="mt-1 text-[9px] font-bold text-[var(--text-muted)] font-body">
                      {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Day columns with events */}
          <div className="grid grid-cols-7 min-h-[400px]">
            {weekDays.map((day, i) => {
              const dayEvents = getEventsForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={i}
                  onClick={() => openCreateForSlot(day)}
                  className={`relative p-1.5 space-y-1.5 cursor-pointer hover:bg-[var(--surface-hover)]/50 transition-colors ${
                    i < 6 ? "border-r border-[var(--border)]" : ""
                  } ${isToday ? "bg-[#FFE600]/5" : ""}`}
                >
                  {dayEvents.length === 0 && (
                    <p className="text-center text-[10px] text-[var(--text-muted)] pt-4 font-body">
                      Click to add
                    </p>
                  )}
                  {dayEvents.map((event) => (
                    <CompactEventCard
                      key={event.id}
                      event={event}
                      onEventClick={setDetailEvent}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Day View ──────────────────────────────────────── */
        <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
          {/* Time grid */}
          <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
            {/* Hour slots — clickable */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                onClick={() => openCreateForSlot(currentDate, hour)}
                className="absolute left-0 right-0 border-t border-[var(--border)] cursor-pointer hover:bg-[#FFE600]/5 transition-colors group"
                style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              >
                <span className="absolute -top-2.5 left-2 text-[10px] text-[var(--text-muted)] bg-[var(--surface)] px-1 font-body pointer-events-none">
                  {hour === 0
                    ? "12 AM"
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? "12 PM"
                        : `${hour - 12} PM`}
                </span>
                {/* Hover hint */}
                <span className="absolute right-3 top-1 text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity font-body flex items-center gap-1">
                  <Plus size={10} /> Add event
                </span>
              </div>
            ))}

            {/* Current time indicator */}
            {isSameDay(currentDate, today) && (
              <div
                className="absolute left-12 right-2 h-0.5 bg-[#FF6B6B] z-10 pointer-events-none"
                style={{
                  top: `${(today.getHours() * 60 + today.getMinutes()) * (HOUR_HEIGHT / 60)}px`,
                }}
              >
                <div className="absolute -left-1.5 -top-[3px] h-2 w-2 rounded-full bg-[#FF6B6B]" />
              </div>
            )}

            {/* Events */}
            {getEventsForDay(currentDate).map((event) => {
              const topPx =
                getEventTop(event.start) * (HOUR_HEIGHT / 60);
              const heightPx =
                getEventHeight(event.start, event.end) * (HOUR_HEIGHT / 60);
              return (
                <div
                  key={event.id}
                  className="absolute left-14 right-3 z-[5]"
                  style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                >
                  <DayEventCard event={event} onEventClick={setDetailEvent} />
                </div>
              );
            })}
          </div>

          {/* Empty state for day */}
          {getEventsForDay(currentDate).length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CalendarIcon
                size={28}
                className="text-[var(--text-muted)]"
              />
              <p className="text-sm font-bold text-[var(--text-secondary)] font-heading">
                No events today
              </p>
              <p className="text-xs text-[var(--text-muted)] font-body">
                Click any time slot to create one
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Event Modal */}
      <CreateEventModal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditEvent(null); }}
        onCreated={fetchEvents}
        prefillDate={createPrefillDate}
        prefillHour={createPrefillHour}
        editEvent={editEvent}
      />

      {/* Event Detail Modal */}
      <EventDetailModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onDeleted={fetchEvents}
        onEdit={openEditModal}
      />
    </div>
  );
}

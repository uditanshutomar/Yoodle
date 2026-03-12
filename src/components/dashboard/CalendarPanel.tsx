"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/* ─── Types ─── */

interface APICalendarEvent {
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

type CalEvent = {
    id: string;
    title: string;
    time: string;
    dayIndex: number;
    startHour: number;
    duration: number;
    color: string;
    bgColor: string;
    location?: string;
    meetLink?: string;
    attendeeCount: number;
    isAllDay: boolean;
    fullDate: Date;
};

interface YoodleUser {
    id: string;
    name: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
}

/* ─── Color cycling ─── */
const EVENT_COLORS = [
    { color: "#3B82F6", bgColor: "#DBEAFE", dotColor: "#93C5FD" },
    { color: "#22C55E", bgColor: "#DCFCE7", dotColor: "#86EFAC" },
    { color: "#A855F7", bgColor: "#F3E8FF", dotColor: "#C4B5FD" },
    { color: "#F59E0B", bgColor: "#FEF3C7", dotColor: "#FCD34D" },
    { color: "#EC4899", bgColor: "#FCE7F3", dotColor: "#F9A8D4" },
    { color: "#EF4444", bgColor: "#FEE2E2", dotColor: "#FCA5A5" },
];

/* ─── Constants ─── */
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 22;
const ROW_HEIGHT = 44;

const HOURS_LABELS: string[] = [];
for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    HOURS_LABELS.push(`${h12} ${ampm}`);
}

/* ─── Helpers ─── */

function getWeekData(weekOffset: number = 0) {
    const now = new Date();
    const todayDayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - todayDayOfWeek + weekOffset * 7);
    sunday.setHours(0, 0, 0, 0);

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const days = dayNames.map((day, i) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        return { day, date: d.getDate(), fullDate: new Date(d) };
    });

    const collapsed = [
        Math.max(0, todayDayOfWeek - 1),
        todayDayOfWeek,
        Math.min(6, todayDayOfWeek + 1),
    ];
    const collapsedIndices = [...new Set(collapsed)];

    const midWeek = new Date(sunday);
    midWeek.setDate(sunday.getDate() + 3);

    return {
        days,
        todayIndex: weekOffset === 0 ? todayDayOfWeek : -1,
        collapsedIndices,
        month: midWeek.toLocaleString("default", { month: "long" }),
        year: midWeek.getFullYear(),
        sunday,
    };
}

function getMonthData(weekOffset: number) {
    const now = new Date();
    const refDate = new Date(now);
    refDate.setDate(now.getDate() + weekOffset * 7);
    const year = refDate.getFullYear();
    const month = refDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startDay);

    const cells: { date: Date; dayNum: number; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        cells.push({ date: d, dayNum: d.getDate(), isCurrentMonth: d.getMonth() === month });
    }

    return {
        cells,
        monthName: firstOfMonth.toLocaleString("default", { month: "long" }),
        year,
        gridStart,
        gridEnd: new Date(gridStart.getTime() + 42 * 86400000),
    };
}

function formatHour(h: number): string {
    const hour = Math.floor(h);
    const minutes = Math.round((h - hour) * 60);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return minutes > 0 ? `${h12}:${minutes.toString().padStart(2, "0")} ${ampm}` : `${h12}:00 ${ampm}`;
}

function isDateOnly(dateStr: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function toDatetimeLocal(date: Date, hour: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(Math.floor(hour)).padStart(2, "0");
    const mm = String(Math.round((hour % 1) * 60)).padStart(2, "0");
    return `${y}-${m}-${d}T${hh}:${mm}`;
}

function getDefaultStartEnd(): { start: string; end: string } {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const endHour = new Date(nextHour);
    endHour.setHours(nextHour.getHours() + 1);
    return {
        start: toDatetimeLocal(nextHour, nextHour.getHours()),
        end: toDatetimeLocal(endHour, endHour.getHours()),
    };
}

function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function apiEventToCalEvent(event: APICalendarEvent, index: number, weekSunday: Date): CalEvent | null {
    const colorSet = EVENT_COLORS[index % EVENT_COLORS.length];

    if (isDateOnly(event.start)) {
        const startDate = new Date(event.start + "T00:00:00");
        const dayIndex = startDate.getDay();
        const weekEnd = new Date(weekSunday);
        weekEnd.setDate(weekSunday.getDate() + 7);
        if (startDate < weekSunday || startDate >= weekEnd) return null;

        return {
            id: event.id, title: event.title || "Untitled", time: "All day",
            dayIndex, startHour: 0, duration: 24,
            color: colorSet.color, bgColor: colorSet.bgColor,
            location: event.location, meetLink: event.meetLink,
            attendeeCount: event.attendees?.length || 0, isAllDay: true,
            fullDate: startDate,
        };
    }

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    const dayIndex = startDate.getDay();
    const weekEnd = new Date(weekSunday);
    weekEnd.setDate(weekSunday.getDate() + 7);
    if (startDate < weekSunday || startDate >= weekEnd) return null;

    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    const durationMs = endDate.getTime() - startDate.getTime();
    const duration = Math.max(durationMs / (1000 * 60 * 60), 0.25);
    if (startHour >= GRID_END_HOUR || startHour + duration <= GRID_START_HOUR) return null;

    return {
        id: event.id, title: event.title || "Untitled",
        time: `${formatHour(startHour)} – ${formatHour(startHour + duration)}`,
        dayIndex, startHour: Math.max(startHour, GRID_START_HOUR),
        duration: Math.min(duration, GRID_END_HOUR - Math.max(startHour, GRID_START_HOUR)),
        color: colorSet.color, bgColor: colorSet.bgColor,
        location: event.location, meetLink: event.meetLink,
        attendeeCount: event.attendees?.length || 0, isAllDay: false,
        fullDate: startDate,
    };
}

/** For month view — parse event without week-relative filtering */
function apiEventToMonthEvent(event: APICalendarEvent, index: number): CalEvent | null {
    const colorSet = EVENT_COLORS[index % EVENT_COLORS.length];
    const startDate = isDateOnly(event.start) ? new Date(event.start + "T00:00:00") : new Date(event.start);
    const endDate = isDateOnly(event.start) ? startDate : new Date(event.end);
    const isAllDay = isDateOnly(event.start);
    const startHour = isAllDay ? 0 : startDate.getHours() + startDate.getMinutes() / 60;
    const durationMs = endDate.getTime() - startDate.getTime();
    const duration = isAllDay ? 24 : Math.max(durationMs / (1000 * 60 * 60), 0.25);

    return {
        id: event.id, title: event.title || "Untitled",
        time: isAllDay ? "All day" : `${formatHour(startHour)} – ${formatHour(startHour + duration)}`,
        dayIndex: startDate.getDay(), startHour, duration,
        color: colorSet.color, bgColor: colorSet.bgColor,
        location: event.location, meetLink: event.meetLink,
        attendeeCount: event.attendees?.length || 0, isAllDay,
        fullDate: startDate,
    };
}

/* ─── EventDetailPopup ─── */
function EventDetailPopup({ event, daysOfWeek, currentMonth, onClose }: {
    event: CalEvent;
    daysOfWeek: { day: string; date: number; fullDate: Date }[];
    currentMonth: string;
    onClose: () => void;
}) {
    const dayInfo = daysOfWeek[event.dayIndex];
    const yoodleLink = event.location?.includes("/meetings/join?code=") ? event.location : null;
    const meetLink = yoodleLink || event.meetLink;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-4 right-4 z-40 w-80 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
        >
            {/* Color accent bar */}
            <div className="absolute top-0 left-5 right-5 h-1 rounded-b-full" style={{ backgroundColor: event.color }} />

            <div className="flex items-start justify-between mb-4 mt-1">
                <div className="flex-1 min-w-0">
                    <h3 className="font-black text-[var(--text-primary)] text-base leading-tight truncate" style={{ fontFamily: "var(--font-heading)" }}>
                        {event.title}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1" style={{ fontFamily: "var(--font-heading)" }}>
                        {dayInfo?.day || ""}, {currentMonth} {dayInfo?.date || ""}
                    </p>
                </div>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClose}
                    className="ml-2 flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--surface-hover)] text-[var(--text-muted)] transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </motion.button>
            </div>

            <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-hover)]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    </div>
                    <span className="font-medium">{event.time}</span>
                </div>
                {event.location && !yoodleLink && (
                    <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-hover)]">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        </div>
                        <span className="truncate font-medium">{event.location}</span>
                    </div>
                )}
                {event.attendeeCount > 0 && (
                    <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-hover)]">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        </div>
                        <span className="font-medium">{event.attendeeCount} attendee{event.attendeeCount > 1 ? "s" : ""}</span>
                    </div>
                )}
            </div>

            {meetLink ? (
                <a href={meetLink} target="_blank" rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#FFE600] px-4 py-2.5 text-xs font-bold text-[#0A0A0A] border-2 border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A] hover:shadow-[1px_1px_0_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                    style={{ fontFamily: "var(--font-heading)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                    {yoodleLink ? "Join Yoodle" : "Join Meeting"}
                </a>
            ) : (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[var(--surface-hover)] px-4 py-2.5 text-xs font-semibold text-[var(--text-muted)]" style={{ fontFamily: "var(--font-heading)" }}>
                    No meeting link
                </div>
            )}
        </motion.div>
    );
}

/* ─── QuickAddPopover ─── */
function QuickAddPopover({ dayName, timeLabel, onSave, onMoreOptions, onClose, saving }: {
    dayName: string; timeLabel: string;
    onSave: (title: string) => void;
    onMoreOptions: (title: string) => void;
    onClose: () => void;
    saving: boolean;
}) {
    const [title, setTitle] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="w-60 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
        >
            <input
                ref={inputRef}
                type="text" value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onSave(title.trim()); if (e.key === "Escape") onClose(); }}
                placeholder="Add title"
                className="w-full text-sm font-semibold bg-transparent border-b-2 border-[var(--border)] pb-2 mb-2 outline-none placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
                disabled={saving}
            />
            <p className="text-[10px] text-[var(--text-secondary)] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                {dayName}, {timeLabel}
            </p>
            <div className="flex gap-2">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => title.trim() && onSave(title.trim())}
                    disabled={!title.trim() || saving}
                    className="flex-1 rounded-lg bg-[#FFE600] px-3 py-1.5 text-xs font-bold text-[#0A0A0A] border border-[#0A0A0A] disabled:opacity-50 transition-all"
                    style={{ fontFamily: "var(--font-heading)" }}>
                    {saving ? "Saving…" : "Save"}
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => onMoreOptions(title)}
                    className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-all"
                    style={{ fontFamily: "var(--font-heading)" }}>
                    More options →
                </motion.button>
            </div>
        </motion.div>
    );
}

/* ─── AttendeeSearch ─── */
function AttendeeSearch({ selectedUsers, onAdd, onRemove }: {
    selectedUsers: YoodleUser[];
    onAdd: (user: YoodleUser) => void;
    onRemove: (userId: string) => void;
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<YoodleUser[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback(async (q: string) => {
        if (q.length < 1) { setResults([]); return; }
        try {
            const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=10`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setResults((data.data || []).filter((u: YoodleUser) => !selectedUsers.some(s => s.id === u.id)));
            }
        } catch { /* ignore */ }
    }, [selectedUsers]);

    const handleInput = (value: string) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(value), 300);
        setShowDropdown(true);
    };

    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                Invite people
            </label>
            {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1">
                    {selectedUsers.map(user => (
                        <span key={user.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFE600]/20 border border-[#FFE600] text-xs font-semibold text-[var(--text-primary)]">
                            {user.avatarUrl && <Image src={user.avatarUrl} alt="" width={16} height={16} className="w-4 h-4 rounded-full" />}
                            {user.displayName || user.name}
                            <button onClick={() => onRemove(user.id)} className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">×</button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative">
                <input
                    type="text" value={query}
                    onChange={(e) => handleInput(e.target.value)}
                    onFocus={() => query.length > 0 && setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    placeholder="Search by name…"
                    className="w-full border-2 border-[var(--border-strong)] rounded-xl px-4 py-2.5 text-sm bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[#FFE600] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    style={{ fontFamily: "var(--font-body)" }}
                />
                {showDropdown && results.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] max-h-48 overflow-y-auto">
                        {results.map(user => (
                            <button key={user.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { onAdd(user); setQuery(""); setResults([]); setShowDropdown(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#FFE600]/10 text-left transition-colors">
                                {user.avatarUrl ? <Image src={user.avatarUrl} alt="" width={24} height={24} className="w-6 h-6 rounded-full" /> : (
                                    <div className="w-6 h-6 rounded-full bg-[var(--surface-hover)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
                                        {(user.displayName || user.name).charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <span className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                                    {user.displayName || user.name}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── CreateEventModal ─── */
function CreateEventModal({ open, onClose, onCreated, defaultStart, defaultEnd, defaultTitle }: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    defaultStart?: string;
    defaultEnd?: string;
    defaultTitle?: string;
}) {
    const [title, setTitle] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [addYoodleLink, setAddYoodleLink] = useState(false);
    const [attendees, setAttendees] = useState<YoodleUser[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            const defaults = getDefaultStartEnd();
            setTitle(defaultTitle || "");
            setStart(defaultStart || defaults.start);
            setEnd(defaultEnd || defaults.end);
            setDescription("");
            setLocation("");
            setAddYoodleLink(false);
            setAttendees([]);
            setError("");
        }
    }, [open, defaultStart, defaultEnd, defaultTitle]);

    const handleStartChange = (val: string) => {
        setStart(val);
        if (val) {
            const s = new Date(val);
            const e = new Date(s.getTime() + 3600000);
            setEnd(toDatetimeLocal(e, e.getHours() + e.getMinutes() / 60));
        }
    };

    const handleCreate = async () => {
        setError("");
        if (!title.trim()) { setError("Please enter an event title"); return; }
        if (!start || !end) { setError("Start and end time are required"); return; }
        if (new Date(end) <= new Date(start)) { setError("End time must be after start time"); return; }

        setCreating(true);
        try {
            let yoodleLink: string | undefined;

            if (addYoodleLink) {
                const meetRes = await fetch("/api/meetings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ title: title.trim() }),
                });
                if (!meetRes.ok) throw new Error("Failed to create Yoodle room");
                const meetData = await meetRes.json();
                const code = meetData.data?.code;
                if (code) yoodleLink = `${window.location.origin}/meetings/join?code=${code}`;
            }

            const eventDescription = [
                description.trim(),
                yoodleLink ? `\nYoodle Meeting: ${yoodleLink}` : "",
            ].filter(Boolean).join("\n");

            const res = await fetch("/api/calendar/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    title: title.trim(),
                    description: eventDescription || undefined,
                    start: new Date(start).toISOString(),
                    end: new Date(end).toISOString(),
                    location: yoodleLink || (location.trim() || undefined),
                    attendeeUserIds: attendees.length > 0 ? attendees.map(u => u.id) : undefined,
                    addMeetLink: false,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            });

            if (!res.ok) {
                if (yoodleLink) {
                    setError(`Calendar event failed, but Yoodle room was created: ${yoodleLink}`);
                } else {
                    const data = await res.json().catch(() => null);
                    setError(data?.error?.message || "Failed to create event. Please try again.");
                }
                return;
            }

            onClose();
            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setCreating(false);
        }
    };

    return (
        <Modal open={open} onOpenChange={(v) => !v && onClose()} title="New Event" description="Add an event to your Google Calendar">
            <div className="space-y-4">
                <Input label="Event Title" placeholder="e.g. Team standup, Lunch with Alex…" value={title}
                    onChange={(e) => setTitle(e.target.value)} maxLength={500} error={error && !title.trim() ? "Title is required" : undefined} autoFocus />

                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>Start</label>
                        <input type="datetime-local" value={start} onChange={(e) => handleStartChange(e.target.value)}
                            className="border-2 border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[#FFE600] text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>End</label>
                        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                            className="border-2 border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none focus:ring-2 focus:ring-[#FFE600] text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }} />
                    </div>
                </div>

                <Textarea label="Description (optional)" placeholder="What's this event about?" value={description}
                    onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} />

                <Input label="Location (optional)" placeholder="Office, Zoom link, coffee shop…" value={location}
                    onChange={(e) => setLocation(e.target.value)} maxLength={500} />

                <AttendeeSearch selectedUsers={attendees}
                    onAdd={(user) => setAttendees(prev => [...prev, user])}
                    onRemove={(userId) => setAttendees(prev => prev.filter(u => u.id !== userId))} />

                {/* Yoodle link toggle */}
                <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <span className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                            Add Yoodle room link
                        </span>
                    </div>
                    <button onClick={() => setAddYoodleLink(!addYoodleLink)} className="relative h-6 w-11 rounded-full transition-colors duration-200"
                        style={{ backgroundColor: addYoodleLink ? "#FFE600" : "rgba(10,10,10,0.15)" }}>
                        <motion.div className="absolute top-0.5 h-5 w-5 rounded-full bg-white border border-[#0A0A0A]/20 shadow-sm"
                            animate={{ left: addYoodleLink ? "calc(100% - 22px)" : "2px" }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                    </button>
                </div>

                {error && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 font-medium">
                        {error}
                    </div>
                )}

                <Button onClick={handleCreate} loading={creating} className="w-full">
                    Create Event
                </Button>
            </div>
        </Modal>
    );
}

/* ─── AddEventButton ─── */
function AddEventButton({ size = "sm", onClick }: { size?: "sm" | "md"; onClick: (e: React.MouseEvent) => void }) {
    const isMd = size === "md";
    return (
        <motion.button whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.96 }}
            onClick={onClick}
            className={`flex items-center justify-center gap-1.5 rounded-xl bg-[#FFE600] font-black text-[#0A0A0A] border-2 border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A] hover:shadow-[1px_1px_0_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${isMd ? "px-4 py-1.5 text-xs" : "h-7 w-7 text-xs"}`}
            style={{ fontFamily: "var(--font-heading)" }}>
            <svg width={isMd ? 14 : 12} height={isMd ? 14 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {isMd && "New"}
        </motion.button>
    );
}

/* ─── MonthView ─── */
function MonthView({ weekOffset, events, onDayClick }: {
    weekOffset: number;
    events: CalEvent[];
    onDayClick: (date: Date) => void;
}) {
    const { cells } = getMonthData(weekOffset);
    const today = new Date();

    return (
        <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                    <div key={d} className="py-2 text-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                        {d}
                    </div>
                ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) => {
                    const cellEvents = events.filter(e => sameDay(e.fullDate, cell.date));
                    const isToday = sameDay(cell.date, today);
                    return (
                        <motion.div key={i}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => onDayClick(cell.date)}
                            className={`min-h-[84px] p-2 rounded-xl cursor-pointer transition-all border ${isToday
                                ? "border-[var(--foreground)] bg-[var(--foreground)]/[0.03]"
                                : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-hover)]"
                            } ${!cell.isCurrentMonth ? "opacity-35" : ""}`}>
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${isToday
                                ? "bg-[var(--foreground)] text-white shadow-sm"
                                : "text-[var(--text-primary)]"
                            }`} style={{ fontFamily: "var(--font-heading)" }}>
                                {cell.dayNum}
                            </span>
                            <div className="mt-1.5 space-y-1">
                                {cellEvents.slice(0, 2).map(ev => (
                                    <div key={ev.id} className="rounded-md px-1.5 py-0.5 text-[9px] font-bold truncate border"
                                        style={{ backgroundColor: ev.bgColor, color: ev.color, borderColor: `${ev.color}30`, fontFamily: "var(--font-heading)" }}>
                                        {ev.title}
                                    </div>
                                ))}
                                {cellEvents.length > 2 && (
                                    <p className="text-[9px] text-[var(--text-muted)] font-bold pl-1" style={{ fontFamily: "var(--font-heading)" }}>
                                        +{cellEvents.length - 2} more
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── DayView ─── */
function DayView({ dayData, events, allDayEvents, currentTimeOffset, quickAdd, quickSaving, onGridClick, onQuickSave, onQuickMoreOptions, onQuickClose, onSelectEvent }: {
    dayData: { day: string; date: number; fullDate: Date };
    events: CalEvent[];
    allDayEvents: CalEvent[];
    currentTimeOffset: number | null;
    quickAdd: { hour: number; top: number; left: number } | null;
    quickSaving: boolean;
    onGridClick: (hour: number) => void;
    onQuickSave: (title: string) => void;
    onQuickMoreOptions: (title: string) => void;
    onQuickClose: () => void;
    onSelectEvent: (e: CalEvent | null) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const totalHours = GRID_END_HOUR - GRID_START_HOUR;

    useEffect(() => {
        if (scrollRef.current && currentTimeOffset !== null) {
            const target = Math.max(0, (currentTimeOffset - 1) * ROW_HEIGHT);
            scrollRef.current.scrollTo({ top: target, behavior: "smooth" });
        }
    }, [currentTimeOffset]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest("[data-event-card]")) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollTop = scrollRef.current?.scrollTop || 0;
        const relativeY = e.clientY - rect.top + scrollTop;
        const clickedHour = Math.floor(relativeY / ROW_HEIGHT) + GRID_START_HOUR;
        if (clickedHour >= GRID_START_HOUR && clickedHour < GRID_END_HOUR) onGridClick(clickedHour);
    };

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
            {allDayEvents.length > 0 && (
                <div className="py-3 border-b border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>All day</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {allDayEvents.map(ev => (
                            <motion.div key={ev.id} whileHover={{ scale: 1.03 }}
                                className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold border cursor-pointer transition-shadow hover:shadow-sm"
                                style={{ backgroundColor: ev.bgColor, color: ev.color, borderColor: `${ev.color}30`, fontFamily: "var(--font-heading)" }}
                                onClick={() => onSelectEvent(ev)}>
                                {ev.title}
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
            <div className="relative cursor-crosshair" style={{ height: totalHours * ROW_HEIGHT }} onClick={handleClick}>
                {HOURS_LABELS.map((hour, i) => (
                    <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * ROW_HEIGHT }}>
                        <span className="w-14 flex-shrink-0 text-[10px] text-[var(--text-muted)] font-medium -mt-1.5 pr-2 text-right" style={{ fontFamily: "var(--font-heading)" }}>{hour}</span>
                        <div className="flex-1 border-t border-[var(--border)]" />
                    </div>
                ))}
                {events.map(event => {
                    const topOffset = (event.startHour - GRID_START_HOUR) * ROW_HEIGHT + 2;
                    const height = event.duration * ROW_HEIGHT - 4;
                    return (
                        <motion.div key={event.id} data-event-card
                            initial={false}
                            whileHover={{ scale: 1.005, zIndex: 20 }}
                            onClick={(e) => { e.stopPropagation(); onSelectEvent(event); }}
                            className="absolute rounded-xl px-3.5 py-2.5 cursor-pointer overflow-hidden transition-all hover:shadow-lg border"
                            style={{ top: topOffset, height: Math.max(height, 30), left: 58, right: 12, backgroundColor: event.bgColor, borderColor: `${event.color}25`, borderLeft: `4px solid ${event.color}`, zIndex: 10 }}>
                            <p className="text-sm font-bold truncate" style={{ color: event.color, fontFamily: "var(--font-heading)" }}>{event.title}</p>
                            {event.duration >= 0.75 && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{event.time}</p>}
                            {event.attendeeCount > 0 && event.duration >= 1.25 && (
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{event.attendeeCount} attendee{event.attendeeCount > 1 ? "s" : ""}</p>
                            )}
                        </motion.div>
                    );
                })}
                {currentTimeOffset !== null && currentTimeOffset >= 0 && currentTimeOffset <= totalHours && (
                    <div className="absolute left-14 right-0 z-30 flex items-center pointer-events-none" style={{ top: currentTimeOffset * ROW_HEIGHT }}>
                        <div className="h-3 w-3 rounded-full bg-[var(--coral)] -ml-1.5 shadow-sm ring-2 ring-[var(--coral)]/30" />
                        <div className="flex-1 border-t-2 border-[var(--coral)]" />
                    </div>
                )}
                <AnimatePresence>
                    {quickAdd && (
                        <div style={{ position: "absolute", top: quickAdd.top, left: 64, zIndex: 50 }}>
                            <QuickAddPopover dayName={dayData.day} timeLabel={`${formatHour(quickAdd.hour)} – ${formatHour(quickAdd.hour + 1)}`}
                                onSave={onQuickSave} onMoreOptions={onQuickMoreOptions} onClose={onQuickClose} saving={quickSaving} />
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

/* ─── Main Component ─── */
export default function CalendarPanel() {
    // Hydration guard — prevents server/client date mismatch (React error #418)
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const [weekOffset, setWeekOffset] = useState(0);
    const [view, setView] = useState<"Month" | "Week" | "Day">("Week");
    const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

    const weekData = useMemo(() => getWeekData(weekOffset), [weekOffset]);
    const { days: DAYS_OF_WEEK, todayIndex: TODAY_INDEX, collapsedIndices: COLLAPSED_INDICES, month: CURRENT_MONTH, year: CURRENT_YEAR } = weekData;

    const [expanded, setExpanded] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [monthEvents, setMonthEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [noGoogleAccess, setNoGoogleAccess] = useState(false);
    const [portalReady, setPortalReady] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const [currentTimeOffset, setCurrentTimeOffset] = useState<number | null>(null);
    useEffect(() => {
        const update = () => setCurrentTimeOffset(new Date().getHours() + new Date().getMinutes() / 60 - GRID_START_HOUR);
        update();
        const interval = setInterval(update, 60_000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => { setPortalReady(true); }, []);

    useEffect(() => {
        if (expanded && scrollRef.current && currentTimeOffset !== null && view === "Week") {
            const scrollTarget = Math.max(0, (currentTimeOffset - 1) * ROW_HEIGHT);
            scrollRef.current.scrollTo({ top: scrollTarget, behavior: "smooth" });
        }
    }, [expanded, currentTimeOffset, view]);

    // Reset day selection when week changes
    useEffect(() => { setSelectedDayIndex(null); }, [weekOffset]);

    /* ─── Event Creation State ─── */
    const [quickAdd, setQuickAdd] = useState<{ dayIndex: number; hour: number; top: number; left: number } | null>(null);
    const [quickSaving, setQuickSaving] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [modalDefaults, setModalDefaults] = useState<{ start?: string; end?: string; title?: string }>({});

    /* ─── Fetch Events ─── */
    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            const now = new Date();
            let timeMin: Date, timeMax: Date;

            if (view === "Month") {
                const { gridStart, gridEnd } = getMonthData(weekOffset);
                timeMin = gridStart;
                timeMax = gridEnd;
            } else {
                const sunday = new Date(now);
                sunday.setDate(now.getDate() - now.getDay() + weekOffset * 7);
                sunday.setHours(0, 0, 0, 0);
                timeMin = sunday;
                timeMax = new Date(sunday);
                timeMax.setDate(sunday.getDate() + 7);
                timeMax.setHours(23, 59, 59, 999);
            }

            const res = await fetch(
                `/api/calendar/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&maxResults=100`,
                { credentials: "include" }
            );

            if (res.status === 403) {
                const data = await res.json();
                if (data.error?.code === "NO_GOOGLE_ACCESS") { setNoGoogleAccess(true); return; }
            }
            if (!res.ok) throw new Error("Failed to fetch calendar events");

            const data = await res.json();
            const apiEvents: APICalendarEvent[] = data.data || [];

            if (view === "Month") {
                const calEvents = apiEvents.map((e, i) => apiEventToMonthEvent(e, i)).filter((e): e is CalEvent => e !== null);
                setMonthEvents(calEvents);
                // Also set week events for when user switches back
                const wkSunday = new Date(now);
                wkSunday.setDate(now.getDate() - now.getDay() + weekOffset * 7);
                wkSunday.setHours(0, 0, 0, 0);
                const weekCalEvents = apiEvents.map((e, i) => apiEventToCalEvent(e, i, wkSunday)).filter((e): e is CalEvent => e !== null);
                setEvents(weekCalEvents);
            } else {
                const calEvents = apiEvents.map((e, i) => apiEventToCalEvent(e, i, timeMin)).filter((e): e is CalEvent => e !== null);
                setEvents(calEvents);
            }
        } catch {
            // Calendar fetch failed — UI will show empty state
        } finally {
            setLoading(false);
        }
    }, [weekOffset, view]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    /* ─── Navigation ─── */
    const handleNavPrev = useCallback(() => {
        if (view === "Month") setWeekOffset(prev => prev - 4);
        else if (view === "Day") {
            if (selectedDayIndex !== null && selectedDayIndex > 0) setSelectedDayIndex(selectedDayIndex - 1);
            else { setWeekOffset(prev => prev - 1); setSelectedDayIndex(6); }
        } else setWeekOffset(prev => prev - 1);
    }, [view, selectedDayIndex]);

    const handleNavNext = useCallback(() => {
        if (view === "Month") setWeekOffset(prev => prev + 4);
        else if (view === "Day") {
            if (selectedDayIndex !== null && selectedDayIndex < 6) setSelectedDayIndex(selectedDayIndex + 1);
            else { setWeekOffset(prev => prev + 1); setSelectedDayIndex(0); }
        } else setWeekOffset(prev => prev + 1);
    }, [view, selectedDayIndex]);

    const handleNavToday = useCallback(() => {
        setWeekOffset(0);
        setSelectedDayIndex(null);
    }, []);

    /* ─── View switching ─── */
    const handleViewChange = useCallback((v: "Month" | "Week" | "Day") => {
        setView(v);
        if (v === "Day" && selectedDayIndex === null) {
            setSelectedDayIndex(weekOffset === 0 ? new Date().getDay() : 1);
        }
    }, [selectedDayIndex, weekOffset]);

    /* ─── Month day click → switch to Day view ─── */
    const handleMonthDayClick = useCallback((date: Date) => {
        const now = new Date();
        const currentSunday = new Date(now);
        currentSunday.setDate(now.getDate() - now.getDay());
        currentSunday.setHours(0, 0, 0, 0);

        const targetSunday = new Date(date);
        targetSunday.setDate(date.getDate() - date.getDay());
        targetSunday.setHours(0, 0, 0, 0);

        const diffDays = Math.round((targetSunday.getTime() - currentSunday.getTime()) / 86400000);
        const newOffset = Math.round(diffDays / 7);

        setWeekOffset(newOffset);
        setSelectedDayIndex(date.getDay());
        setView("Day");
    }, []);

    /* ─── Quick Add Handlers (Week view) ─── */
    const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest("[data-event-card]")) return;
        const grid = gridRef.current;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        const scrollTop = scrollRef.current?.scrollTop || 0;
        const relativeY = e.clientY - rect.top + scrollTop;
        const clickedHour = Math.floor(relativeY / ROW_HEIGHT) + GRID_START_HOUR;
        if (clickedHour < GRID_START_HOUR || clickedHour >= GRID_END_HOUR) return;
        const relativeX = e.clientX - rect.left;
        const gridWidth = rect.width;
        const hourLabelWidth = 48;
        const dayWidth = (gridWidth - hourLabelWidth) / 7;
        const dayIndex = Math.floor((relativeX - hourLabelWidth) / dayWidth);
        if (dayIndex < 0 || dayIndex > 6) return;
        const topPos = (clickedHour - GRID_START_HOUR) * ROW_HEIGHT;
        const leftPos = hourLabelWidth + dayIndex * dayWidth;
        setSelectedEvent(null);
        setQuickAdd({ dayIndex, hour: clickedHour, top: topPos, left: leftPos });
    }, []);

    /* ─── Quick Add for Day view ─── */
    const handleDayGridClick = useCallback((hour: number) => {
        const topPos = (hour - GRID_START_HOUR) * ROW_HEIGHT;
        setSelectedEvent(null);
        setQuickAdd({ dayIndex: selectedDayIndex ?? (weekOffset === 0 ? new Date().getDay() : 1), hour, top: topPos, left: 60 });
    }, [selectedDayIndex, weekOffset]);

    const handleQuickSave = useCallback(async (title: string) => {
        if (!quickAdd) return;
        setQuickSaving(true);
        const dayDate = DAYS_OF_WEEK[quickAdd.dayIndex]?.fullDate;
        if (!dayDate) { setQuickSaving(false); return; }
        const startStr = toDatetimeLocal(dayDate, quickAdd.hour);
        const endDate = new Date(dayDate);
        endDate.setHours(quickAdd.hour + 1);
        const endStr = toDatetimeLocal(endDate, quickAdd.hour + 1);
        try {
            const res = await fetch("/api/calendar/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ title, start: new Date(startStr).toISOString(), end: new Date(endStr).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
            });
            if (!res.ok) throw new Error("Failed to create event");
            setQuickAdd(null);
            await fetchEvents();
        } catch { /* quick save failed — UI resets */ }
        finally { setQuickSaving(false); }
    }, [quickAdd, DAYS_OF_WEEK, fetchEvents]);

    const handleQuickMoreOptions = useCallback((title: string) => {
        if (!quickAdd) return;
        const dayDate = DAYS_OF_WEEK[quickAdd.dayIndex]?.fullDate;
        if (!dayDate) return;
        const startStr = toDatetimeLocal(dayDate, quickAdd.hour);
        const endDate = new Date(dayDate);
        endDate.setHours(quickAdd.hour + 1);
        const endStr = toDatetimeLocal(endDate, quickAdd.hour + 1);
        setQuickAdd(null);
        setModalDefaults({ start: startStr, end: endStr, title: title || undefined });
        setShowCreateModal(true);
    }, [quickAdd, DAYS_OF_WEEK]);

    const openCreateModal = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setModalDefaults({});
        setShowCreateModal(true);
    }, []);

    /* ─── Computed event lists ─── */
    const allDayEvents = useMemo(() => events.filter((e) => e.isAllDay), [events]);
    const timedEvents = useMemo(() => events.filter((e) => !e.isAllDay), [events]);
    const totalHours = GRID_END_HOUR - GRID_START_HOUR;

    /* ─── Header display text ─── */
    const headerText = useMemo(() => {
        if (view === "Month") {
            const { monthName, year } = getMonthData(weekOffset);
            return `${monthName}, ${year}`;
        }
        return `${CURRENT_MONTH}, ${CURRENT_YEAR}`;
    }, [view, weekOffset, CURRENT_MONTH, CURRENT_YEAR]);

    // Hydration guard: render a static placeholder until client-side mount.
    // This prevents React error #418 caused by server/client date mismatches.
    if (!mounted) {
        return (
            <div className="relative rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden p-4"
                style={{ maxWidth: 340, marginLeft: "auto" }}>
                <div className="py-6 space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-2 px-1">
                            <div className="w-10 h-3 rounded-md bg-[var(--surface-hover)] animate-pulse" />
                            <div className="flex-1 h-8 rounded-lg bg-[var(--surface-hover)] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    /* ─── Collapsed card ─── */
    const collapsedVisibleDays = DAYS_OF_WEEK.filter((_, i) => COLLAPSED_INDICES.includes(i));
    const collapsedVisibleEvents = timedEvents.filter((e) => COLLAPSED_INDICES.includes(e.dayIndex));
    const collapsedAllDay = allDayEvents.filter((e) => COLLAPSED_INDICES.includes(e.dayIndex));
    const COLLAPSED_ROW_HEIGHT = 48;
    const COLLAPSED_HOURS = HOURS_LABELS.slice(0, 9);

    const collapsedCard = (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 25 }}
            className="relative rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden p-4 cursor-pointer"
            style={{ maxWidth: 340, marginLeft: "auto" }}
            onClick={() => setExpanded(true)}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <h3 className="text-sm font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>{CURRENT_MONTH}</h3>
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>This week</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {!noGoogleAccess && <AddEventButton size="sm" onClick={openCreateModal} />}
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setExpanded(true)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    </motion.button>
                </div>
            </div>

            {/* Day strip */}
            <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: `repeat(${collapsedVisibleDays.length}, 1fr)` }}>
                {collapsedVisibleDays.map((d, idx) => {
                    const origIdx = COLLAPSED_INDICES[idx];
                    const isToday = origIdx === TODAY_INDEX;
                    return (
                        <div key={d.day} className={`flex flex-col items-center py-1.5 rounded-xl transition-all ${isToday ? "bg-[var(--foreground)] text-white shadow-sm" : "bg-[var(--background)] text-[var(--text-secondary)]"}`}>
                            <span className="text-[9px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>{d.day.slice(0, 3)}</span>
                            <span className={`text-base font-bold ${isToday ? "text-white" : "text-[var(--text-primary)]"}`} style={{ fontFamily: "var(--font-heading)" }}>{d.date}</span>
                        </div>
                    );
                })}
            </div>

            {noGoogleAccess ? (
                <div className="flex flex-col items-center py-6 text-center">
                    <div className="w-11 h-11 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center mb-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    </div>
                    <p className="text-xs font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>Connect Google Calendar</p>
                    <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">Sync your calendar to see and<br />manage events here.</p>
                    <a href="/settings" className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#7C3AED] hover:bg-[#6D28D9] px-4 py-1.5 rounded-lg transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
                        Connect
                    </a>
                </div>
            ) : loading ? (
                <div className="py-6 space-y-3">
                    {/* Skeleton loading */}
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-2 px-1">
                            <div className="w-10 h-3 rounded-md bg-[var(--surface-hover)] animate-pulse" />
                            <div className="flex-1 h-8 rounded-lg bg-[var(--surface-hover)] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="relative" style={{ height: COLLAPSED_HOURS.length * COLLAPSED_ROW_HEIGHT }}>
                    {COLLAPSED_HOURS.map((hour, i) => (
                        <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * COLLAPSED_ROW_HEIGHT }}>
                            <span className="w-10 flex-shrink-0 text-[9px] text-[var(--text-muted)] font-medium -mt-1" style={{ fontFamily: "var(--font-heading)" }}>{hour}</span>
                            <div className="flex-1 border-t border-[var(--border)]" />
                        </div>
                    ))}
                    {collapsedVisibleEvents.map((event) => {
                        const relIdx = COLLAPSED_INDICES.indexOf(event.dayIndex);
                        if (relIdx < 0) return null;
                        const topOffset = (event.startHour - GRID_START_HOUR) * COLLAPSED_ROW_HEIGHT + 2;
                        const height = event.duration * COLLAPSED_ROW_HEIGHT - 4;
                        const colWidth = 100 / COLLAPSED_INDICES.length;
                        return (
                            <div key={event.id} className="absolute rounded-md px-1.5 py-1 overflow-hidden border border-[var(--border)]"
                                style={{ top: topOffset, height: Math.max(height, 20), left: `calc(40px + ${relIdx * colWidth}%)`, width: `calc(${colWidth}% - 4px)`, backgroundColor: event.bgColor, borderLeft: `2px solid ${event.color}`, zIndex: 5 }}>
                                <p className="text-[9px] font-bold truncate" style={{ color: event.color, fontFamily: "var(--font-heading)" }}>{event.title}</p>
                            </div>
                        );
                    })}
                    {collapsedVisibleEvents.length === 0 && collapsedAllDay.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <div className="w-8 h-8 rounded-xl bg-[var(--surface-hover)] flex items-center justify-center mb-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            </div>
                            <p className="text-[10px] font-semibold text-[var(--text-muted)]" style={{ fontFamily: "var(--font-heading)" }}>Nothing scheduled</p>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );

    /* ─── Expanded Overlay ─── */
    const expandedOverlay = (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm p-6 overflow-hidden"
            onClick={() => { setExpanded(false); setSelectedEvent(null); setQuickAdd(null); }}
        >
            <motion.div
                initial={{ y: 40, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                className="relative w-full max-w-[1100px] rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden flex flex-col"
                style={{ maxHeight: "calc(100vh - 48px)" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] flex-shrink-0">
                    {/* Left: Title + Nav */}
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7C3AED]/10">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        </div>
                        <h2 className="text-lg font-black text-[var(--text-primary)] min-w-[140px]" style={{ fontFamily: "var(--font-heading)" }}>
                            {headerText}
                        </h2>
                        <div className="flex items-center gap-0.5">
                            <button onClick={handleNavPrev} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                            <button onClick={handleNavToday} className="px-3 py-1 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                                Today
                            </button>
                            <button onClick={handleNavNext} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Center: View toggle */}
                    <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--background)] p-0.5">
                        {(["Month", "Week", "Day"] as const).map((v) => (
                            <button key={v} onClick={() => handleViewChange(v)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v
                                    ? "bg-[#FFE600] text-[#0A0A0A] shadow-sm"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                }`}
                                style={{ fontFamily: "var(--font-heading)" }}>
                                {v}
                            </button>
                        ))}
                    </div>

                    {/* Right: New + Close */}
                    <div className="flex items-center gap-2">
                        {!noGoogleAccess && <AddEventButton size="md" onClick={openCreateModal} />}
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => { setExpanded(false); setSelectedEvent(null); setQuickAdd(null); }}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors" title="Close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </motion.button>
                    </div>
                </div>

                {/* ── Day strip (Week/Day views only) ── */}
                {view !== "Month" && (
                    <div className="grid gap-1 px-6 py-3 border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
                        <div />
                        {DAYS_OF_WEEK.map((d, i) => {
                            const isSelected = selectedDayIndex === i;
                            const isToday = i === TODAY_INDEX;
                            const hasEvents = events.some(e => e.dayIndex === i);
                            return (
                                <motion.div key={d.day}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                        setSelectedDayIndex(i);
                                        if (view === "Week") handleViewChange("Day");
                                    }}
                                    className={`relative flex flex-col items-center py-2 rounded-xl transition-all cursor-pointer ${isSelected
                                        ? "bg-[#FFE600] shadow-[2px_2px_0_#0A0A0A] border-2 border-[#0A0A0A]"
                                        : isToday
                                            ? "bg-[var(--foreground)] text-white shadow-md border-2 border-transparent"
                                            : "bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border-2 border-transparent"
                                    }`}>
                                    <span className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? "text-[#0A0A0A]/60" : isToday ? "text-white/70" : ""}`}
                                        style={{ fontFamily: "var(--font-heading)" }}>{d.day.slice(0, 3)}</span>
                                    <span className={`text-lg font-black mt-0.5 ${isSelected ? "text-[#0A0A0A]" : isToday ? "text-white" : "text-[var(--text-primary)]"}`}
                                        style={{ fontFamily: "var(--font-heading)" }}>
                                        {d.date}
                                    </span>
                                    {/* Event dot indicator */}
                                    {hasEvents && !isSelected && !isToday && (
                                        <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--violet)]" />
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* ── Views ── */}
                {view === "Month" && (
                    <MonthView weekOffset={weekOffset} events={monthEvents.length > 0 ? monthEvents : events} onDayClick={handleMonthDayClick} />
                )}

                {view === "Day" && (() => {
                    const dayIdx = selectedDayIndex ?? (weekOffset === 0 ? new Date().getDay() : 1);
                    const dayData = DAYS_OF_WEEK[dayIdx] || DAYS_OF_WEEK[0];
                    const dayTimedEvents = timedEvents.filter(e => e.dayIndex === dayIdx);
                    const dayAllDayEvents = allDayEvents.filter(e => e.dayIndex === dayIdx);
                    return (
                        <DayView dayData={dayData} events={dayTimedEvents} allDayEvents={dayAllDayEvents}
                            currentTimeOffset={weekOffset === 0 && dayIdx === new Date().getDay() ? currentTimeOffset : null}
                            quickAdd={quickAdd} quickSaving={quickSaving}
                            onGridClick={handleDayGridClick} onQuickSave={handleQuickSave} onQuickMoreOptions={handleQuickMoreOptions}
                            onQuickClose={() => setQuickAdd(null)} onSelectEvent={setSelectedEvent} />
                    );
                })()}

                {view === "Week" && (
                    <>
                        {/* All-day events row */}
                        {allDayEvents.length > 0 && (
                            <div className="grid gap-1 px-6 py-2.5 border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
                                <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider pt-1 pr-2 text-right" style={{ fontFamily: "var(--font-heading)" }}>All day</span>
                                {DAYS_OF_WEEK.map((_, dayIdx) => {
                                    const dayAllDay = allDayEvents.filter((e) => e.dayIndex === dayIdx);
                                    return (
                                        <div key={dayIdx} className="space-y-1 min-h-[24px]">
                                            {dayAllDay.map((ev) => (
                                                <motion.div key={ev.id} whileHover={{ scale: 1.02 }}
                                                    className="rounded-lg px-1.5 py-0.5 text-[10px] font-bold truncate cursor-pointer border hover:shadow-sm transition-shadow"
                                                    style={{ backgroundColor: ev.bgColor, color: ev.color, borderColor: `${ev.color}25`, fontFamily: "var(--font-heading)" }}
                                                    onClick={() => setSelectedEvent(ev)}>
                                                    {ev.title}
                                                </motion.div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Scrollable timeline grid */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-6">
                            <div ref={gridRef} className="relative cursor-crosshair" style={{ height: totalHours * ROW_HEIGHT }} onClick={handleGridClick}>
                                {HOURS_LABELS.map((hour, i) => (
                                    <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * ROW_HEIGHT }}>
                                        <span className="w-14 flex-shrink-0 text-[10px] text-[var(--text-muted)] font-medium -mt-1.5 pr-2 text-right" style={{ fontFamily: "var(--font-heading)" }}>{hour}</span>
                                        <div className="flex-1 border-t border-[var(--border)]" />
                                    </div>
                                ))}
                                {Array.from({ length: 6 }, (_, i) => (
                                    <div key={`vline-${i}`} className="absolute top-0 bottom-0 border-l border-[var(--border)] opacity-20"
                                        style={{ left: `calc(56px + ${(i + 1) * ((100 - 5.6) / 7)}%)` }} />
                                ))}
                                {timedEvents.map((event) => {
                                    const topOffset = (event.startHour - GRID_START_HOUR) * ROW_HEIGHT + 2;
                                    const height = event.duration * ROW_HEIGHT - 4;
                                    return (
                                        <motion.div key={event.id} data-event-card
                                            initial={false}
                                            whileHover={{ scale: 1.01, zIndex: 20 }}
                                            onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); setQuickAdd(null); }}
                                            className="absolute rounded-lg px-2 py-1.5 cursor-pointer overflow-hidden transition-all hover:shadow-md border"
                                            style={{ top: topOffset, height: Math.max(height, 26), left: `calc(56px + (${event.dayIndex} * ((100% - 60px) / 7)))`, width: `calc((100% - 60px) / 7 - 4px)`, backgroundColor: event.bgColor, borderColor: `${event.color}20`, borderLeft: `3px solid ${event.color}`, zIndex: 10 }}>
                                            <p className="text-[11px] font-bold truncate" style={{ color: event.color, fontFamily: "var(--font-heading)" }}>{event.title}</p>
                                            {event.duration >= 0.75 && <p className="text-[9px] text-[var(--text-secondary)] mt-0.5">{event.time}</p>}
                                            {event.attendeeCount > 0 && event.duration >= 1.25 && (
                                                <p className="text-[8px] text-[var(--text-muted)] mt-0.5">{event.attendeeCount} attendee{event.attendeeCount > 1 ? "s" : ""}</p>
                                            )}
                                        </motion.div>
                                    );
                                })}
                                {timedEvents.length === 0 && allDayEvents.length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center">
                                            <div className="w-12 h-12 rounded-2xl bg-[var(--surface-hover)] flex items-center justify-center mx-auto mb-3">
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="16" x2="15" y2="16" /></svg>
                                            </div>
                                            <p className="text-sm font-bold text-[var(--text-muted)] mb-0.5" style={{ fontFamily: "var(--font-heading)" }}>No events this week</p>
                                            <p className="text-xs text-[var(--text-muted)]">Click any time slot to add one</p>
                                        </div>
                                    </div>
                                )}
                                {currentTimeOffset !== null && currentTimeOffset >= 0 && currentTimeOffset <= totalHours && (
                                    <div className="absolute left-14 right-0 z-30 flex items-center pointer-events-none" style={{ top: currentTimeOffset * ROW_HEIGHT }}>
                                        <div className="h-3 w-3 rounded-full bg-[var(--coral)] -ml-1.5 shadow-sm ring-2 ring-[var(--coral)]/30" />
                                        <div className="flex-1 border-t-2 border-[var(--coral)]" />
                                    </div>
                                )}
                                <AnimatePresence>
                                    {quickAdd && (
                                        <div style={{ position: "absolute", top: quickAdd.top, left: Math.min(quickAdd.left, 800), zIndex: 50 }}>
                                            <QuickAddPopover dayName={DAYS_OF_WEEK[quickAdd.dayIndex]?.day || ""} timeLabel={`${formatHour(quickAdd.hour)} – ${formatHour(quickAdd.hour + 1)}`}
                                                onSave={handleQuickSave} onMoreOptions={handleQuickMoreOptions} onClose={() => setQuickAdd(null)} saving={quickSaving} />
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </>
                )}

                {/* Event detail popup */}
                <AnimatePresence>
                    {selectedEvent && (
                        <EventDetailPopup event={selectedEvent} daysOfWeek={DAYS_OF_WEEK} currentMonth={CURRENT_MONTH} onClose={() => setSelectedEvent(null)} />
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );

    return (
        <>
            {collapsedCard}
            {portalReady && createPortal(
                <AnimatePresence>{expanded && expandedOverlay}</AnimatePresence>,
                document.body
            )}
            <CreateEventModal
                open={showCreateModal}
                onClose={() => { setShowCreateModal(false); setModalDefaults({}); }}
                onCreated={fetchEvents}
                defaultStart={modalDefaults.start}
                defaultEnd={modalDefaults.end}
                defaultTitle={modalDefaults.title}
            />
        </>
    );
}

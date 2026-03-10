"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

/* ─── Types ─── */

/** API response shape from /api/calendar/events (Google Calendar) */
interface APICalendarEvent {
    id: string;
    title: string;
    description: string;
    start: string; // ISO 8601 datetime or date-only
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
    dayIndex: number; // 0-6 (Sun-Sat)
    startHour: number;
    duration: number; // in hours (can be fractional)
    color: string;
    bgColor: string;
    location?: string;
    meetLink?: string;
    attendeeCount: number;
    isAllDay: boolean;
};

/* ─── Color cycling for events ─── */
const EVENT_COLORS = [
    { color: "#3B82F6", bgColor: "#DBEAFE" },
    { color: "#22C55E", bgColor: "#DCFCE7" },
    { color: "#A855F7", bgColor: "#F3E8FF" },
    { color: "#F59E0B", bgColor: "#FEF3C7" },
    { color: "#EC4899", bgColor: "#FCE7F3" },
    { color: "#EF4444", bgColor: "#FEE2E2" },
];

/* ─── Constants ─── */
const GRID_START_HOUR = 7; // 7 AM
const GRID_END_HOUR = 22; // 10 PM

const HOURS_LABELS: string[] = [];
for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    HOURS_LABELS.push(`${h12} ${ampm}`);
}

/* ─── Helpers ─── */

function getWeekData() {
    const now = new Date();
    const todayDayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - todayDayOfWeek);

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

    return { days, todayIndex: todayDayOfWeek, collapsedIndices, month: now.toLocaleString("default", { month: "long" }), year: now.getFullYear() };
}

function formatHour(h: number): string {
    const hour = Math.floor(h);
    const minutes = Math.round((h - hour) * 60);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return minutes > 0 ? `${h12}:${minutes.toString().padStart(2, "0")} ${ampm}` : `${h12}:00 ${ampm}`;
}

/** Detect if a date string is date-only (all-day event) vs datetime */
function isDateOnly(dateStr: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/** Convert Date + hour to datetime-local input value (YYYY-MM-DDTHH:MM) */
function toDatetimeLocal(date: Date, hour: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(Math.floor(hour)).padStart(2, "0");
    const mm = String(Math.round((hour % 1) * 60)).padStart(2, "0");
    return `${y}-${m}-${d}T${hh}:${mm}`;
}

/** Get default start time (next whole hour) */
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

/** Convert a Google Calendar API event to our CalEvent format */
function apiEventToCalEvent(event: APICalendarEvent, index: number, weekSunday: Date): CalEvent | null {
    const colorSet = EVENT_COLORS[index % EVENT_COLORS.length];

    // Handle all-day events
    if (isDateOnly(event.start)) {
        const startDate = new Date(event.start + "T00:00:00");
        const dayIndex = startDate.getDay();

        const weekEnd = new Date(weekSunday);
        weekEnd.setDate(weekSunday.getDate() + 7);
        if (startDate < weekSunday || startDate >= weekEnd) return null;

        return {
            id: event.id,
            title: event.title || "Untitled",
            time: "All day",
            dayIndex,
            startHour: 0,
            duration: 24,
            color: colorSet.color,
            bgColor: colorSet.bgColor,
            location: event.location,
            meetLink: event.meetLink,
            attendeeCount: event.attendees?.length || 0,
            isAllDay: true,
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
        id: event.id,
        title: event.title || "Untitled",
        time: `${formatHour(startHour)} – ${formatHour(startHour + duration)}`,
        dayIndex,
        startHour: Math.max(startHour, GRID_START_HOUR),
        duration: Math.min(duration, GRID_END_HOUR - Math.max(startHour, GRID_START_HOUR)),
        color: colorSet.color,
        bgColor: colorSet.bgColor,
        location: event.location,
        meetLink: event.meetLink,
        attendeeCount: event.attendees?.length || 0,
        isAllDay: false,
    };
}

/* ─── Sub-components ─── */

function EventDetailPopup({
    event, daysOfWeek, currentMonth, onClose,
}: {
    event: CalEvent;
    daysOfWeek: { day: string; date: number; fullDate: Date }[];
    currentMonth: string;
    onClose: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute right-5 top-1/4 z-40 w-[250px] rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
        >
            <button
                onClick={onClose}
                className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>

            <h3 className="text-base font-bold text-[var(--text-primary)] mb-3 pr-6" style={{ fontFamily: "var(--font-heading)" }}>
                {event.title}
            </h3>

            <div className="space-y-2.5 mb-4">
                <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    {daysOfWeek[event.dayIndex]?.day}, {daysOfWeek[event.dayIndex]?.date} {currentMonth}
                </div>
                <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    {event.time}
                </div>
                {event.location && (
                    <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        {event.location}
                    </div>
                )}
            </div>

            {event.attendeeCount > 0 && (
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-heading)" }}>
                        {event.attendeeCount} attendee{event.attendeeCount > 1 ? "s" : ""}
                    </span>
                </div>
            )}

            <div className="flex items-center gap-2">
                {event.meetLink ? (
                    <motion.a
                        href={event.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex-1 text-center rounded-xl bg-[#FFE600] border-2 border-[#0A0A0A] py-2 text-xs font-bold text-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                        style={{ fontFamily: "var(--font-heading)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        Join Meeting
                    </motion.a>
                ) : (
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex-1 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)] py-2 text-xs font-bold text-[var(--text-secondary)] cursor-default"
                        style={{ fontFamily: "var(--font-heading)" }}
                        disabled
                    >
                        No meet link
                    </motion.button>
                )}
                <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
            </div>
        </motion.div>
    );
}

/* ─── Quick Add Popover ─── */

function QuickAddPopover({
    dayName,
    timeLabel,
    onSave,
    onMoreOptions,
    onClose,
    saving,
}: {
    dayName: string;
    timeLabel: string;
    onSave: (title: string) => void;
    onMoreOptions: (title: string) => void;
    onClose: () => void;
    saving: boolean;
}) {
    const [title, setTitle] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Auto-focus the input
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleEsc);
        return () => document.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    const handleSubmit = () => {
        if (!title.trim()) return;
        onSave(title.trim());
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 5 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="absolute z-50 w-[260px] rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
        >
            <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="Add title"
                className="w-full border-2 border-[var(--border-strong)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all"
                style={{ fontFamily: "var(--font-body)" }}
                disabled={saving}
            />

            <div className="flex items-center gap-2 mt-2.5 text-[11px] text-[var(--text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span style={{ fontFamily: "var(--font-heading)" }}>{dayName}, {timeLabel}</span>
            </div>

            <div className="flex items-center gap-2 mt-3">
                <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
                    disabled={!title.trim() || saving}
                    className="flex-1 rounded-lg bg-[#FFE600] border-2 border-[var(--border-strong)] py-1.5 text-xs font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)] disabled:opacity-40 disabled:shadow-none transition-all"
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    {saving ? "Saving..." : "Save"}
                </motion.button>
                <button
                    onClick={() => onMoreOptions(title)}
                    className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    More options →
                </button>
            </div>
        </motion.div>
    );
}

/* ─── Create Event Modal ─── */

function CreateEventModal({
    open,
    onClose,
    onCreated,
    defaultStart,
    defaultEnd,
    defaultTitle,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    defaultStart?: string;
    defaultEnd?: string;
    defaultTitle?: string;
}) {
    const defaults = getDefaultStartEnd();
    const [title, setTitle] = useState(defaultTitle || "");
    const [description, setDescription] = useState("");
    const [start, setStart] = useState(defaultStart || defaults.start);
    const [end, setEnd] = useState(defaultEnd || defaults.end);
    const [location, setLocation] = useState("");
    const [addMeetLink, setAddMeetLink] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [titleError, setTitleError] = useState("");
    const titleRef = useRef<HTMLInputElement>(null);

    // Reset form when modal opens with new defaults
    useEffect(() => {
        if (open) {
            const d = getDefaultStartEnd();
            setTitle(defaultTitle || "");
            setDescription("");
            setStart(defaultStart || d.start);
            setEnd(defaultEnd || d.end);
            setLocation("");
            setAddMeetLink(false);
            setCreating(false);
            setError("");
            setTitleError("");
            setTimeout(() => titleRef.current?.focus(), 100);
        }
    }, [open, defaultStart, defaultEnd, defaultTitle]);

    const handleCreate = async () => {
        setTitleError("");
        setError("");

        if (!title.trim()) {
            setTitleError("Please enter an event title");
            titleRef.current?.focus();
            return;
        }

        if (!start || !end) {
            setError("Start and end time are required");
            return;
        }

        if (new Date(start) >= new Date(end)) {
            setError("End time must be after start time");
            return;
        }

        setCreating(true);
        try {
            const res = await fetch("/api/calendar/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    start: new Date(start).toISOString(),
                    end: new Date(end).toISOString(),
                    location: location.trim() || undefined,
                    addMeetLink,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error?.message || data.message || "Failed to create event");
            }

            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setCreating(false);
        }
    };

    return (
        <Modal open={open} onOpenChange={(v) => { if (!v) onClose(); }} title="New Event" description="Add an event to your Google Calendar">
            <div className="space-y-4">
                <Input
                    ref={titleRef}
                    label="Event Title"
                    placeholder="e.g. Team standup, Lunch with Alex..."
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(""); }}
                    error={titleError}
                />

                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>Start</label>
                        <input
                            type="datetime-local"
                            value={start}
                            onChange={(e) => {
                                setStart(e.target.value);
                                // Auto-adjust end to 1 hour after new start
                                if (e.target.value) {
                                    const s = new Date(e.target.value);
                                    const newEnd = new Date(s);
                                    newEnd.setHours(s.getHours() + 1);
                                    setEnd(toDatetimeLocal(newEnd, newEnd.getHours() + newEnd.getMinutes() / 60));
                                }
                            }}
                            className="w-full border-2 border-[#0A0A0A] rounded-xl px-3 py-2.5 text-sm bg-white text-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all"
                            style={{ fontFamily: "var(--font-body)" }}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>End</label>
                        <input
                            type="datetime-local"
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                            className="w-full border-2 border-[#0A0A0A] rounded-xl px-3 py-2.5 text-sm bg-white text-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all"
                            style={{ fontFamily: "var(--font-body)" }}
                        />
                    </div>
                </div>

                <Textarea
                    label="Description (optional)"
                    placeholder="What's this event about?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                />

                <Input
                    label="Location (optional)"
                    placeholder="Office, Zoom link, coffee shop..."
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                />

                {/* Meet link toggle */}
                <label className="flex items-center justify-between py-2 cursor-pointer">
                    <span className="flex items-center gap-2 text-sm text-[#0A0A0A]/70" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.6 11.6L22 7v10l-6.4-4.5v1A3 3 0 0 1 12.6 16.5H4a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3h8.6a3 3 0 0 1 3 3v2.1z" /></svg>
                        Add Google Meet link
                    </span>
                    <button
                        type="button"
                        onClick={() => setAddMeetLink(!addMeetLink)}
                        className={`w-11 h-6 rounded-full transition-all cursor-pointer ${addMeetLink ? "bg-[#FFE600]" : "bg-[#0A0A0A]/15"}`}
                    >
                        <motion.div
                            className="w-5 h-5 rounded-full bg-white border-2 border-[#0A0A0A] shadow-sm"
                            animate={{ x: addMeetLink ? 20 : 2 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                    </button>
                </label>

                {/* Error banner */}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#FF6B6B]/10 border-2 border-[#FF6B6B] rounded-xl px-4 py-2.5 text-center"
                    >
                        <p className="text-xs font-bold text-[#FF6B6B]" style={{ fontFamily: "var(--font-heading)" }}>{error}</p>
                    </motion.div>
                )}

                <Button
                    variant="primary"
                    size="lg"
                    loading={creating}
                    onClick={handleCreate}
                    className="w-full"
                >
                    Create Event
                </Button>
            </div>
        </Modal>
    );
}

/* ─── Plus Button ─── */
function AddEventButton({ size = "sm", onClick }: { size?: "sm" | "md"; onClick: (e: React.MouseEvent) => void }) {
    const isSmall = size === "sm";
    return (
        <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            className={`flex items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] transition-all ${isSmall ? "h-6 w-6" : "h-7 gap-1.5 px-3"}`}
            title="Add event"
        >
            <svg width={isSmall ? 12 : 13} height={isSmall ? 12 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {!isSmall && <span className="text-xs font-bold" style={{ fontFamily: "var(--font-heading)" }}>New</span>}
        </motion.button>
    );
}

/* ─── Main Component ─── */
export default function CalendarPanel() {
    const { days: DAYS_OF_WEEK, todayIndex: TODAY_INDEX, collapsedIndices: COLLAPSED_INDICES, month: CURRENT_MONTH, year: CURRENT_YEAR } = getWeekData();
    const [expanded, setExpanded] = useState(false);
    const [view, setView] = useState<"Month" | "Week" | "Day">("Week");
    const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [noGoogleAccess, setNoGoogleAccess] = useState(false);
    const [portalReady, setPortalReady] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    // Track current time on client only to avoid hydration mismatch
    const [currentTimeOffset, setCurrentTimeOffset] = useState<number | null>(null);
    useEffect(() => {
        const update = () => setCurrentTimeOffset(new Date().getHours() + new Date().getMinutes() / 60 - GRID_START_HOUR);
        update();
        const interval = setInterval(update, 60_000);
        return () => clearInterval(interval);
    }, []);

    // Portal mount check
    useEffect(() => { setPortalReady(true); }, []);

    // Auto-scroll to current time when expanding
    useEffect(() => {
        if (expanded && scrollRef.current && currentTimeOffset !== null) {
            const rowH = 44;
            const scrollTarget = Math.max(0, (currentTimeOffset - 1) * rowH);
            scrollRef.current.scrollTo({ top: scrollTarget, behavior: "smooth" });
        }
    }, [expanded, currentTimeOffset]);

    /* ─── Event Creation State ─── */
    const [quickAdd, setQuickAdd] = useState<{ dayIndex: number; hour: number; top: number; left: number } | null>(null);
    const [quickSaving, setQuickSaving] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [modalDefaults, setModalDefaults] = useState<{ start?: string; end?: string; title?: string }>({});

    // Fetch events from Google Calendar API
    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            const now = new Date();
            const sunday = new Date(now);
            sunday.setDate(now.getDate() - now.getDay());
            sunday.setHours(0, 0, 0, 0);

            const endOfWeek = new Date(sunday);
            endOfWeek.setDate(sunday.getDate() + 7);
            endOfWeek.setHours(23, 59, 59, 999);

            const res = await fetch(
                `/api/calendar/events?timeMin=${sunday.toISOString()}&timeMax=${endOfWeek.toISOString()}&maxResults=50`,
                { credentials: "include" }
            );

            if (res.status === 403) {
                const data = await res.json();
                if (data.error?.code === "NO_GOOGLE_ACCESS") {
                    setNoGoogleAccess(true);
                    return;
                }
            }

            if (!res.ok) throw new Error("Failed to fetch calendar events");

            const data = await res.json();
            const apiEvents: APICalendarEvent[] = data.data || [];

            const calEvents = apiEvents
                .map((e, i) => apiEventToCalEvent(e, i, sunday))
                .filter((e): e is CalEvent => e !== null);

            setEvents(calEvents);
        } catch (err) {
            console.error("Failed to fetch calendar events:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    /* ─── Quick Add Handlers ─── */

    const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Don't trigger if clicking on an event card
        if ((e.target as HTMLElement).closest("[data-event-card]")) return;

        const grid = gridRef.current;
        if (!grid) return;

        const rect = grid.getBoundingClientRect();
        const scrollTop = scrollRef.current?.scrollTop || 0;

        // Calculate hour from Y position
        const relativeY = e.clientY - rect.top + scrollTop;
        const ROW_HEIGHT = 44;
        const clickedHour = Math.floor(relativeY / ROW_HEIGHT) + GRID_START_HOUR;
        if (clickedHour < GRID_START_HOUR || clickedHour >= GRID_END_HOUR) return;

        // Calculate day from X position (48px for hour labels, then 7 equal columns)
        const relativeX = e.clientX - rect.left;
        const gridWidth = rect.width;
        const hourLabelWidth = 48;
        const dayWidth = (gridWidth - hourLabelWidth) / 7;
        const dayIndex = Math.floor((relativeX - hourLabelWidth) / dayWidth);
        if (dayIndex < 0 || dayIndex > 6) return;

        // Position the popover near the click
        const topPos = (clickedHour - GRID_START_HOUR) * ROW_HEIGHT;
        const leftPos = hourLabelWidth + dayIndex * dayWidth;

        setSelectedEvent(null);
        setQuickAdd({ dayIndex, hour: clickedHour, top: topPos, left: leftPos });
    }, []);

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
                body: JSON.stringify({
                    title,
                    start: new Date(startStr).toISOString(),
                    end: new Date(endStr).toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            });

            if (!res.ok) throw new Error("Failed to create event");

            setQuickAdd(null);
            await fetchEvents();
        } catch (err) {
            console.error("Quick save failed:", err);
        } finally {
            setQuickSaving(false);
        }
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

    // Separate all-day vs timed events
    const allDayEvents = events.filter((e) => e.isAllDay);
    const timedEvents = events.filter((e) => !e.isAllDay);

    /* ─── Collapsed card (inline in dashboard right column) ─── */
    const collapsedVisibleDays = DAYS_OF_WEEK.filter((_, i) => COLLAPSED_INDICES.includes(i));
    const collapsedVisibleEvents = timedEvents.filter((e) => COLLAPSED_INDICES.includes(e.dayIndex));
    const collapsedAllDay = allDayEvents.filter((e) => COLLAPSED_INDICES.includes(e.dayIndex));
    const COLLAPSED_ROW_HEIGHT = 48;
    const COLLAPSED_HOURS = HOURS_LABELS.slice(0, 9); // 7am - 3pm for collapsed

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
            <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-base text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    {CURRENT_MONTH}
                </h2>
                <div className="flex items-center gap-2">
                    {!noGoogleAccess && <AddEventButton size="sm" onClick={openCreateModal} />}
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                        This week
                    </span>
                    <motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-[var(--text-muted)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    </motion.div>
                </div>
            </div>

            {/* Day strip */}
            <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: `repeat(${collapsedVisibleDays.length}, 1fr)` }}>
                {collapsedVisibleDays.map((d) => {
                    const origIndex = DAYS_OF_WEEK.indexOf(d);
                    return (
                        <div
                            key={d.day}
                            className={`flex flex-col items-center py-1.5 rounded-2xl transition-all ${origIndex === TODAY_INDEX
                                ? "bg-[var(--foreground)] text-white shadow-md"
                                : "bg-[var(--background)] text-[var(--text-secondary)]"
                                }`}
                        >
                            <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>{d.day.slice(0, 3)}</span>
                            <span className={`text-sm font-bold mt-0.5 ${origIndex === TODAY_INDEX ? "text-white" : "text-[var(--text-primary)]"}`} style={{ fontFamily: "var(--font-heading)" }}>
                                {d.date}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* No Google Access */}
            {noGoogleAccess ? (
                <div className="py-8 text-center">
                    <p className="text-xs text-[var(--text-secondary)] mb-2">Connect Google Calendar to see your events here.</p>
                    <a href="/settings" className="inline-block rounded-full border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold text-[var(--text-secondary)] hover:bg-[#FFE600]/20 transition-colors" style={{ fontFamily: "var(--font-heading)" }} onClick={(e) => e.stopPropagation()}>
                        Go to Settings →
                    </a>
                </div>
            ) : loading ? (
                <div className="animate-pulse space-y-2 py-4">
                    {[1, 2, 3].map((i) => (<div key={i} className="h-8 bg-[var(--surface-hover)] rounded-lg" />))}
                </div>
            ) : (
                <>
                    {/* All-day events banner */}
                    {collapsedAllDay.length > 0 && (
                        <div className="mb-2 space-y-1">
                            {collapsedAllDay.map((ev) => (
                                <div key={ev.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-bold border border-[var(--border)]" style={{ backgroundColor: ev.bgColor, color: ev.color, fontFamily: "var(--font-heading)" }}>
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                                    {ev.title} — All day
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Compact timeline */}
                    <div className="relative overflow-hidden" style={{ maxHeight: 200 }}>
                        <div className="relative" style={{ height: COLLAPSED_HOURS.length * COLLAPSED_ROW_HEIGHT }}>
                            {COLLAPSED_HOURS.map((hour, i) => (
                                <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * COLLAPSED_ROW_HEIGHT }}>
                                    <span className="w-10 flex-shrink-0 text-[10px] text-[var(--text-muted)] font-medium pt-0.5" style={{ fontFamily: "var(--font-heading)" }}>{hour}</span>
                                    <div className="flex-1 border-t border-[var(--border)]" />
                                </div>
                            ))}

                            {collapsedVisibleEvents.map((event) => {
                                const topOffset = (event.startHour - GRID_START_HOUR) * COLLAPSED_ROW_HEIGHT + 2;
                                const height = event.duration * COLLAPSED_ROW_HEIGHT - 4;
                                const colIndex = COLLAPSED_INDICES.indexOf(event.dayIndex);
                                const colCount = collapsedVisibleDays.length;
                                if (topOffset < 0 || topOffset > COLLAPSED_HOURS.length * COLLAPSED_ROW_HEIGHT) return null;

                                return (
                                    <div
                                        key={event.id}
                                        className="absolute rounded-lg px-2 py-1 overflow-hidden border border-[var(--border)]"
                                        style={{
                                            top: Math.max(topOffset, 0),
                                            height: Math.max(height, 24),
                                            left: `calc(40px + (${colIndex} * ((100% - 44px) / ${colCount})))`,
                                            width: `calc((100% - 44px) / ${colCount} - 4px)`,
                                            backgroundColor: event.bgColor,
                                            borderLeft: `3px solid ${event.color}`,
                                            zIndex: 10,
                                        }}
                                    >
                                        <p className="text-[10px] font-bold truncate" style={{ color: event.color, fontFamily: "var(--font-heading)" }}>{event.title}</p>
                                        <p className="text-[8px] text-[var(--text-secondary)]">{event.time}</p>
                                    </div>
                                );
                            })}

                            {collapsedVisibleEvents.length === 0 && collapsedAllDay.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <p className="text-xs text-[var(--text-muted)]">No events this week</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Event count badge */}
                    {events.length > 0 && (
                        <div className="mt-2 text-center">
                            <span className="text-[10px] text-[var(--text-muted)]" style={{ fontFamily: "var(--font-heading)" }}>
                                {events.length} event{events.length > 1 ? "s" : ""} this week · Click to expand
                            </span>
                        </div>
                    )}
                </>
            )}
        </motion.div>
    );

    /* ─── Expanded full-screen overlay ─── */
    const ROW_HEIGHT = 44;
    const totalHours = GRID_END_HOUR - GRID_START_HOUR;

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
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
                    <h2 className="text-xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        {CURRENT_MONTH}, {CURRENT_YEAR}
                    </h2>

                    {/* + New Event button */}
                    {!noGoogleAccess && <AddEventButton size="md" onClick={openCreateModal} />}

                    {/* View toggle */}
                    <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] p-0.5">
                        {(["Month", "Week", "Day"] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all ${view === v
                                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                                    }`}
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                {v}
                            </button>
                        ))}
                    </div>

                    {/* Nav + close */}
                    <div className="flex items-center gap-1">
                        <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <button className="px-3 py-1 rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                            Today
                        </button>
                        <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                        <div className="w-px h-4 bg-[var(--border)] mx-1" />
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => { setExpanded(false); setSelectedEvent(null); setQuickAdd(null); }}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                            title="Close"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </motion.button>
                    </div>
                </div>

                {/* ── Day strip ── */}
                <div className="grid gap-1.5 px-6 py-3 border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
                    {/* Spacer for hour labels column */}
                    <div />
                    {DAYS_OF_WEEK.map((d, i) => (
                        <div
                            key={d.day}
                            className={`flex flex-col items-center py-2 rounded-2xl transition-all ${i === TODAY_INDEX
                                ? "bg-[var(--foreground)] text-white shadow-md"
                                : "bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                                }`}
                        >
                            <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>{d.day.slice(0, 3)}</span>
                            <span className={`text-lg font-bold mt-0.5 ${i === TODAY_INDEX ? "text-white" : "text-[var(--text-primary)]"}`} style={{ fontFamily: "var(--font-heading)" }}>
                                {d.date}
                            </span>
                        </div>
                    ))}
                </div>

                {/* ── All-day events row ── */}
                {allDayEvents.length > 0 && (
                    <div className="grid gap-1.5 px-6 py-2 border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
                        <span className="text-[10px] text-[var(--text-muted)] font-medium pt-1" style={{ fontFamily: "var(--font-heading)" }}>All day</span>
                        {DAYS_OF_WEEK.map((_, dayIdx) => {
                            const dayAllDay = allDayEvents.filter((e) => e.dayIndex === dayIdx);
                            return (
                                <div key={dayIdx} className="space-y-1 min-h-[24px]">
                                    {dayAllDay.map((ev) => (
                                        <div
                                            key={ev.id}
                                            className="rounded px-1.5 py-0.5 text-[10px] font-bold truncate cursor-pointer border border-[var(--border)] hover:shadow-sm transition-shadow"
                                            style={{ backgroundColor: ev.bgColor, color: ev.color, fontFamily: "var(--font-heading)" }}
                                            onClick={() => setSelectedEvent(ev)}
                                        >
                                            {ev.title}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Scrollable timeline grid ── */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-6">
                    <div ref={gridRef} className="relative cursor-crosshair" style={{ height: totalHours * ROW_HEIGHT }} onClick={handleGridClick}>
                        {/* Hour lines */}
                        {HOURS_LABELS.map((hour, i) => (
                            <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * ROW_HEIGHT }}>
                                <span className="w-12 flex-shrink-0 text-[10px] text-[var(--text-muted)] font-medium -mt-1.5" style={{ fontFamily: "var(--font-heading)" }}>
                                    {hour}
                                </span>
                                <div className="flex-1 border-t border-[var(--border)]" />
                            </div>
                        ))}

                        {/* Vertical day dividers */}
                        {Array.from({ length: 6 }, (_, i) => (
                            <div
                                key={`vline-${i}`}
                                className="absolute top-0 bottom-0 border-l border-[var(--border)] opacity-30"
                                style={{ left: `calc(48px + ${(i + 1) * ((100 - 4.8) / 7)}%)` }}
                            />
                        ))}

                        {/* Event cards */}
                        {timedEvents.map((event) => {
                            const topOffset = (event.startHour - GRID_START_HOUR) * ROW_HEIGHT + 2;
                            const height = event.duration * ROW_HEIGHT - 4;

                            return (
                                <motion.div
                                    key={event.id}
                                    data-event-card
                                    whileHover={{ scale: 1.01, zIndex: 20 }}
                                    onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); setQuickAdd(null); }}
                                    className="absolute rounded-lg px-2 py-1.5 cursor-pointer overflow-hidden transition-all hover:shadow-md border border-[var(--border)]"
                                    style={{
                                        top: topOffset,
                                        height: Math.max(height, 26),
                                        left: `calc(48px + (${event.dayIndex} * ((100% - 52px) / 7)))`,
                                        width: `calc((100% - 52px) / 7 - 4px)`,
                                        backgroundColor: event.bgColor,
                                        borderLeft: `3px solid ${event.color}`,
                                        zIndex: 10,
                                    }}
                                >
                                    <p className="text-[11px] font-bold truncate" style={{ color: event.color, fontFamily: "var(--font-heading)" }}>
                                        {event.title}
                                    </p>
                                    <p className="text-[9px] text-[var(--text-secondary)] mt-0.5">{event.time}</p>
                                    {event.attendeeCount > 0 && event.duration >= 1 && (
                                        <p className="text-[8px] text-[var(--text-muted)] mt-0.5">
                                            {event.attendeeCount} attendee{event.attendeeCount > 1 ? "s" : ""}
                                        </p>
                                    )}
                                </motion.div>
                            );
                        })}

                        {/* Empty state */}
                        {timedEvents.length === 0 && allDayEvents.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center">
                                    <p className="text-sm text-[var(--text-muted)] mb-1">No events this week</p>
                                    <p className="text-xs text-[var(--text-muted)]">Click any time slot to add an event</p>
                                </div>
                            </div>
                        )}

                        {/* Current time indicator */}
                        {currentTimeOffset !== null && currentTimeOffset >= 0 && currentTimeOffset <= totalHours && (
                            <div
                                className="absolute left-12 right-0 z-30 flex items-center pointer-events-none"
                                style={{ top: currentTimeOffset * ROW_HEIGHT }}
                            >
                                <div className="h-2.5 w-2.5 rounded-full bg-[#FF6B6B] -ml-1.5 shadow-sm" />
                                <div className="flex-1 border-t-2 border-[#FF6B6B]" />
                            </div>
                        )}

                        {/* Quick-add popover */}
                        <AnimatePresence>
                            {quickAdd && (
                                <div style={{ position: "absolute", top: quickAdd.top, left: Math.min(quickAdd.left, 800), zIndex: 50 }}>
                                    <QuickAddPopover
                                        dayName={DAYS_OF_WEEK[quickAdd.dayIndex]?.day || ""}
                                        timeLabel={`${formatHour(quickAdd.hour)} – ${formatHour(quickAdd.hour + 1)}`}
                                        onSave={handleQuickSave}
                                        onMoreOptions={handleQuickMoreOptions}
                                        onClose={() => setQuickAdd(null)}
                                        saving={quickSaving}
                                    />
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Event detail popup */}
                <AnimatePresence>
                    {selectedEvent && (
                        <EventDetailPopup
                            event={selectedEvent}
                            daysOfWeek={DAYS_OF_WEEK}
                            currentMonth={CURRENT_MONTH}
                            onClose={() => setSelectedEvent(null)}
                        />
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
            {/* Create Event Modal — always rendered via portal */}
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

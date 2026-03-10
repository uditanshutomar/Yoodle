"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";

/* ─── Types ─── */

/** API response shape from /api/calendar/events (Google Calendar) */
interface APICalendarEvent {
    id: string;
    title: string;
    description: string;
    start: string; // ISO 8601
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
    startHour: number; // 9-17
    duration: number; // in hours (can be fractional)
    color: string;
    bgColor: string;
    location?: string;
    meetLink?: string;
    attendeeCount: number;
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
        return { day, date: d.getDate() };
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

/** Convert a Google Calendar API event to our CalEvent format */
function apiEventToCalEvent(event: APICalendarEvent, index: number, weekSunday: Date): CalEvent | null {
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    // Determine which day of the week this event falls on
    const dayIndex = startDate.getDay(); // 0=Sun, 6=Sat

    // Only include events that fall within the current week
    const weekEnd = new Date(weekSunday);
    weekEnd.setDate(weekSunday.getDate() + 7);
    if (startDate < weekSunday || startDate >= weekEnd) return null;

    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    const durationMs = endDate.getTime() - startDate.getTime();
    const duration = Math.max(durationMs / (1000 * 60 * 60), 0.25); // min 15 min

    // Clamp to visible range (9-18)
    if (startHour >= 18 || startHour + duration <= 9) return null;

    const colorSet = EVENT_COLORS[index % EVENT_COLORS.length];

    return {
        id: event.id,
        title: event.title || "Untitled",
        time: `${formatHour(startHour)} - ${formatHour(startHour + duration)}`,
        dayIndex,
        startHour: Math.max(startHour, 9),
        duration: Math.min(duration, 18 - Math.max(startHour, 9)),
        color: colorSet.color,
        bgColor: colorSet.bgColor,
        location: event.location,
        meetLink: event.meetLink,
        attendeeCount: event.attendees?.length || 0,
    };
}

const HOURS = [
    "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm", "5 pm",
];

/* ─── Component ─── */
export default function CalendarPanel() {
    // Compute week data on every render so "today" stays fresh across
    // midnight without requiring a page reload. getWeekData() is trivially
    // cheap (a few Date objects) so memoization is unnecessary.
    const { days: DAYS_OF_WEEK, todayIndex: TODAY_INDEX, collapsedIndices: COLLAPSED_INDICES, month: CURRENT_MONTH, year: CURRENT_YEAR } = getWeekData();
    const [expanded, setExpanded] = useState(false);
    const [view, setView] = useState<"Month" | "Week" | "Day">("Week");
    const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [noGoogleAccess, setNoGoogleAccess] = useState(false);

    // Track current time on client only to avoid hydration mismatch
    const [currentTimeOffset, setCurrentTimeOffset] = useState<number | null>(null);
    useEffect(() => {
        const update = () => setCurrentTimeOffset(new Date().getHours() - 9 + new Date().getMinutes() / 60);
        update();
        const interval = setInterval(update, 60_000);
        return () => clearInterval(interval);
    }, []);

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
            // Don't set error state — just show empty calendar gracefully
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const ROW_HEIGHT = expanded ? 64 : 48;
    const visibleDays = expanded ? DAYS_OF_WEEK : DAYS_OF_WEEK.filter((_, i) => COLLAPSED_INDICES.includes(i));
    const visibleEvents = expanded ? events : events.filter((e) => COLLAPSED_INDICES.includes(e.dayIndex));
    const colCount = visibleDays.length;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 25 }}
            layout
            className={`relative rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden ${expanded ? 'p-5' : 'p-4 cursor-pointer'}`}
            style={expanded ? {} : { maxWidth: 340, marginLeft: 'auto' }}
            onClick={() => { if (!expanded) setExpanded(true); }}
        >
            {/* ── Header row ── */}
            <div className={`flex items-center justify-between ${expanded ? 'mb-4' : 'mb-3'}`}>
                {/* Month title */}
                <h2
                    className={`font-black text-[var(--text-primary)] ${expanded ? 'text-xl' : 'text-base'}`}
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    {expanded ? `${CURRENT_MONTH}, ${CURRENT_YEAR}` : CURRENT_MONTH}
                </h2>

                {expanded ? (
                    <>
                        {/* View toggle — only in expanded */}
                        <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] p-0.5">
                            {(["Month", "Week", "Day"] as const).map((v) => (
                                <button
                                    key={v}
                                    onClick={(e) => { e.stopPropagation(); setView(v); }}
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

                        {/* Nav + collapse */}
                        <div className="flex items-center gap-1">
                            <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                            <button
                                className="px-3 py-1 rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                Today
                            </button>
                            <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                            <div className="w-px h-4 bg-[var(--border)] mx-1" />
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => { e.stopPropagation(); setExpanded(false); setSelectedEvent(null); }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                                title="Collapse"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                            </motion.button>
                        </div>
                    </>
                ) : (
                    /* Collapsed: just show "This week" + expand hint */
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                            This week
                        </span>
                        <motion.div
                            animate={{ x: [0, 3, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="text-[var(--text-muted)]"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                        </motion.div>
                    </div>
                )}
            </div>

            {/* ── Day strip ── */}
            <motion.div layout className={`grid ${expanded ? 'gap-1.5 mb-4' : 'gap-1 mb-3'}`} style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                {visibleDays.map((d) => {
                    const origIndex = DAYS_OF_WEEK.indexOf(d);
                    return (
                        <motion.button
                            key={d.day}
                            layout
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={(e) => e.stopPropagation()}
                            className={`flex flex-col items-center ${expanded ? 'py-2.5' : 'py-1.5'} rounded-2xl transition-all ${origIndex === TODAY_INDEX
                                ? "bg-[var(--foreground)] text-white shadow-md"
                                : "bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                                }`}
                        >
                            <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>
                                {d.day.slice(0, 3)}
                            </span>
                            <span
                                className={`${expanded ? 'text-lg' : 'text-sm'} font-bold mt-0.5 ${origIndex === TODAY_INDEX ? "text-white" : "text-[var(--text-primary)]"}`}
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                {d.date}
                            </span>
                        </motion.button>
                    );
                })}
            </motion.div>

            {/* ── No Google Access state ── */}
            {noGoogleAccess ? (
                <div className="py-8 text-center">
                    <p className="text-xs text-[var(--text-secondary)] mb-2">
                        Connect Google Calendar to see your events here.
                    </p>
                    <a
                        href="/settings"
                        className="inline-block rounded-full border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold text-[var(--text-secondary)] hover:bg-[#FFE600]/20 transition-colors"
                        style={{ fontFamily: "var(--font-heading)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        Go to Settings →
                    </a>
                </div>
            ) : loading ? (
                /* Loading skeleton */
                <div className="animate-pulse space-y-2 py-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-8 bg-[var(--surface-hover)] rounded-lg" />
                    ))}
                </div>
            ) : (
            /* ── Timeline grid ── */
            <div className="relative overflow-y-auto pr-1" style={{ maxHeight: expanded ? 380 : 200 }}>
                <div className="relative" style={{ height: HOURS.length * ROW_HEIGHT }}>
                    {/* Hour lines */}
                    {HOURS.map((hour, i) => (
                        <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * ROW_HEIGHT }}>
                            <span
                                className="w-10 flex-shrink-0 text-[10px] text-[var(--text-muted)] font-medium pt-0.5"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                {hour}
                            </span>
                            <div className="flex-1 border-t border-[var(--border)]" />
                        </div>
                    ))}

                    {/* Event cards */}
                    {visibleEvents.map((event) => {
                        const topOffset = (event.startHour - 9) * ROW_HEIGHT + 2;
                        const height = event.duration * ROW_HEIGHT - 4;
                        const colIndex = expanded
                            ? event.dayIndex
                            : COLLAPSED_INDICES.indexOf(event.dayIndex);

                        return (
                            <motion.div
                                key={event.id}
                                layout
                                whileHover={{ scale: 1.02, zIndex: 20 }}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                                className="absolute rounded-lg px-2 py-1.5 cursor-pointer overflow-hidden transition-all hover:shadow-md border border-[var(--border)]"
                                style={{
                                    top: topOffset,
                                    height: Math.max(height, 28),
                                    left: `calc(40px + (${colIndex} * ((100% - 44px) / ${colCount})))`,
                                    width: `calc((100% - 44px) / ${colCount} - 4px)`,
                                    backgroundColor: event.bgColor,
                                    borderLeft: `3px solid ${event.color}`,
                                    zIndex: 10,
                                }}
                            >
                                <p
                                    className="text-[11px] font-bold truncate"
                                    style={{ color: event.color, fontFamily: "var(--font-heading)" }}
                                >
                                    {event.title}
                                </p>
                                <p className="text-[9px] text-[var(--text-secondary)] mt-0.5">{event.time}</p>
                                {event.attendeeCount > 0 && event.duration >= 1 && (
                                    <p className="text-[8px] text-[var(--text-muted)] mt-1">
                                        {event.attendeeCount} attendee{event.attendeeCount > 1 ? "s" : ""}
                                    </p>
                                )}
                            </motion.div>
                        );
                    })}

                    {/* Empty state */}
                    {visibleEvents.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-xs text-[var(--text-muted)]">No events this week</p>
                        </div>
                    )}

                    {/* Current time indicator */}
                    {currentTimeOffset !== null && (
                        <div
                            className="absolute left-10 right-0 z-30 flex items-center pointer-events-none"
                            style={{ top: currentTimeOffset * ROW_HEIGHT }}
                        >
                            <div className="h-2 w-2 rounded-full bg-[#FF6B6B] -ml-1" />
                            <div className="flex-1 border-t-2 border-[#FF6B6B]" />
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* ── Floating event detail panel ── */}
            <AnimatePresence>
                {selectedEvent && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 10 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="absolute right-5 top-1/4 z-40 w-[250px] rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close */}
                        <button
                            onClick={() => setSelectedEvent(null)}
                            className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>

                        {/* Title */}
                        <h3
                            className="text-base font-bold text-[var(--text-primary)] mb-3 pr-6"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            {selectedEvent.title}
                        </h3>

                        {/* Details */}
                        <div className="space-y-2.5 mb-4">
                            <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                {DAYS_OF_WEEK[selectedEvent.dayIndex]?.day}, {DAYS_OF_WEEK[selectedEvent.dayIndex]?.date} {CURRENT_MONTH}
                            </div>
                            <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                {selectedEvent.time}
                            </div>
                            {selectedEvent.location && (
                                <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    {selectedEvent.location}
                                </div>
                            )}
                        </div>

                        {/* Attendees */}
                        {selectedEvent.attendeeCount > 0 && (
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-[10px] text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-heading)" }}>
                                    {selectedEvent.attendeeCount} attendee{selectedEvent.attendeeCount > 1 ? "s" : ""}
                                </span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {selectedEvent.meetLink ? (
                                <motion.a
                                    href={selectedEvent.meetLink}
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
                )}
            </AnimatePresence>
        </motion.div>
    );
}

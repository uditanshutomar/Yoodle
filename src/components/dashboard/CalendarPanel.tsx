"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

/* ─── Data ─── */
const DAYS_OF_WEEK = [
    { day: "Sunday", date: 2 },
    { day: "Monday", date: 3 },
    { day: "Tuesday", date: 4 },
    { day: "Wednesday", date: 5 },
    { day: "Thursday", date: 6 },
    { day: "Friday", date: 7 },
    { day: "Saturday", date: 8 },
];

const TODAY_INDEX = 5; // Friday the 7th
// Collapsed shows: Thu(4), Fri(5), Sat(6)
const COLLAPSED_INDICES = [4, 5, 6];

const HOURS = [
    "9 am", "10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm", "5 pm",
];

type CalEvent = {
    id: string;
    title: string;
    time: string;
    dayIndex: number; // 0-6 (Sun-Sat)
    startHour: number; // 9-17
    duration: number; // in hours (can be fractional)
    color: string;
    bgColor: string;
    avatars?: string[];
    location?: string;
    tags?: string[];
};

const EVENTS: CalEvent[] = [
    { id: "1", title: "Design Sync", time: "9:00 - 10:00", dayIndex: 5, startHour: 9, duration: 1, color: "#3B82F6", bgColor: "#DBEAFE", avatars: ["/avatars/maya.png", "/avatars/kai.png", "/avatars/fara.png"], location: "Yoodle Room", tags: ["Design", "Sprint"] },
    { id: "2", title: "Product standup", time: "10:00 - 10:30", dayIndex: 5, startHour: 10, duration: 0.5, color: "#22C55E", bgColor: "#DCFCE7", avatars: ["/avatars/kenji.png"] },
    { id: "3", title: "Hiring Panel", time: "3:00 - 4:00", dayIndex: 5, startHour: 15, duration: 1, color: "#A855F7", bgColor: "#F3E8FF", avatars: ["/avatars/kenji.png", "/avatars/huila.png"], location: "Meeting Room B", tags: ["Hiring"] },
    { id: "4", title: "Client Onboarding", time: "4:30 - 5:30", dayIndex: 5, startHour: 16.5, duration: 1, color: "#F59E0B", bgColor: "#FEF3C7", avatars: ["/avatars/fara.png", "/avatars/maya.png"], location: "Zoom", tags: ["Client"] },
    { id: "5", title: "Design onboarding", time: "9:00 - 11:00", dayIndex: 3, startHour: 9, duration: 2, color: "#22C55E", bgColor: "#DCFCE7", avatars: ["/avatars/mila.png", "/avatars/kai.png"] },
    { id: "6", title: "Team retro", time: "2:00 - 3:00", dayIndex: 4, startHour: 14, duration: 1, color: "#EC4899", bgColor: "#FCE7F3", avatars: ["/avatars/eaia.png"] },
    { id: "7", title: "Sprint planning", time: "11:00 - 12:00", dayIndex: 1, startHour: 11, duration: 1, color: "#3B82F6", bgColor: "#DBEAFE", avatars: ["/avatars/kai.png", "/avatars/fara.png"] },
    { id: "8", title: "1:1 with Maya", time: "1:00 - 1:30", dayIndex: 2, startHour: 13, duration: 0.5, color: "#F59E0B", bgColor: "#FEF3C7", avatars: ["/avatars/maya.png"] },
    { id: "9", title: "Code review", time: "3:00 - 4:00", dayIndex: 3, startHour: 15, duration: 1, color: "#A855F7", bgColor: "#F3E8FF" },
    { id: "10", title: "Design review", time: "11:00 - 12:30", dayIndex: 5, startHour: 11, duration: 1.5, color: "#EC4899", bgColor: "#FCE7F3", avatars: ["/avatars/mila.png", "/avatars/kai.png"], tags: ["Design"] },
];

/* ─── Component ─── */
export default function CalendarPanel() {
    const [expanded, setExpanded] = useState(false);
    const [view, setView] = useState<"Month" | "Week" | "Day">("Week");
    const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

    const ROW_HEIGHT = expanded ? 64 : 48;
    const visibleDays = expanded ? DAYS_OF_WEEK : DAYS_OF_WEEK.filter((_, i) => COLLAPSED_INDICES.includes(i));
    const visibleEvents = expanded ? EVENTS : EVENTS.filter((e) => COLLAPSED_INDICES.includes(e.dayIndex));
    const colCount = visibleDays.length;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 25 }}
            layout
            className={`relative rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[4px_4px_0_#0A0A0A] overflow-hidden ${expanded ? 'p-5' : 'p-4 cursor-pointer'}`}
            style={expanded ? {} : { maxWidth: 340, marginLeft: 'auto' }}
            onClick={() => { if (!expanded) setExpanded(true); }}
        >
            {/* ── Header row ── */}
            <div className={`flex items-center justify-between ${expanded ? 'mb-4' : 'mb-3'}`}>
                {/* Month title */}
                <h2
                    className={`font-black text-[#0A0A0A] ${expanded ? 'text-xl' : 'text-base'}`}
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    {expanded ? 'March, 2026' : 'March'}
                </h2>

                {expanded ? (
                    <>
                        {/* View toggle — only in expanded */}
                        <div className="flex items-center rounded-full border border-[#0A0A0A]/10 bg-[#FAFAF8] p-0.5">
                            {(["Month", "Week", "Day"] as const).map((v) => (
                                <button
                                    key={v}
                                    onClick={(e) => { e.stopPropagation(); setView(v); }}
                                    className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all ${view === v
                                        ? "bg-white text-[#0A0A0A] shadow-sm border border-[#0A0A0A]/10"
                                        : "text-[#0A0A0A]/35 hover:text-[#0A0A0A]/60"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>

                        {/* Nav + collapse */}
                        <div className="flex items-center gap-1">
                            <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[#0A0A0A]/10 text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/5 transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                            <button
                                className="px-3 py-1 rounded-full border border-[#0A0A0A]/10 text-xs font-semibold text-[#0A0A0A]/60 hover:bg-[#0A0A0A]/5 transition-colors"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                Today
                            </button>
                            <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[#0A0A0A]/10 text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/5 transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                            <div className="w-px h-4 bg-[#0A0A0A]/10 mx-1" />
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => { e.stopPropagation(); setExpanded(false); setSelectedEvent(null); }}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#0A0A0A]/10 text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/5 transition-colors"
                                title="Collapse"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                            </motion.button>
                        </div>
                    </>
                ) : (
                    /* Collapsed: just show "This week" + expand hint */
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#0A0A0A]/30 uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                            This week
                        </span>
                        <motion.div
                            animate={{ x: [0, 3, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="text-[#0A0A0A]/20"
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
                                ? "bg-[#0A0A0A] text-white shadow-md"
                                : "bg-[#FAFAF8] text-[#0A0A0A]/50 hover:bg-[#0A0A0A]/5"
                                }`}
                        >
                            <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>
                                {d.day.slice(0, 3)}
                            </span>
                            <span
                                className={`${expanded ? 'text-lg' : 'text-sm'} font-bold mt-0.5 ${origIndex === TODAY_INDEX ? "text-white" : "text-[#0A0A0A]"}`}
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                {d.date}
                            </span>
                        </motion.button>
                    );
                })}
            </motion.div>

            {/* ── Timeline grid ── */}
            <div className="relative overflow-y-auto pr-1" style={{ maxHeight: expanded ? 380 : 200 }}>
                <div className="relative" style={{ height: HOURS.length * ROW_HEIGHT }}>
                    {/* Hour lines */}
                    {HOURS.map((hour, i) => (
                        <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * ROW_HEIGHT }}>
                            <span
                                className="w-10 flex-shrink-0 text-[10px] text-[#0A0A0A]/25 font-medium pt-0.5"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                {hour}
                            </span>
                            <div className="flex-1 border-t border-[#0A0A0A]/[0.06]" />
                        </div>
                    ))}

                    {/* Event cards */}
                    {visibleEvents.map((event) => {
                        const topOffset = (event.startHour - 9) * ROW_HEIGHT + 2;
                        const height = event.duration * ROW_HEIGHT - 4;
                        // In collapsed mode, map dayIndex to column position 0/1/2
                        const colIndex = expanded
                            ? event.dayIndex
                            : COLLAPSED_INDICES.indexOf(event.dayIndex);

                        return (
                            <motion.div
                                key={event.id}
                                layout
                                whileHover={{ scale: 1.02, zIndex: 20 }}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                                className="absolute rounded-lg px-2 py-1.5 cursor-pointer overflow-hidden transition-all hover:shadow-md border border-[#0A0A0A]/15"
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
                                <p className="text-[9px] text-[#0A0A0A]/35 mt-0.5">{event.time}</p>
                                {event.avatars && event.duration >= 1 && (
                                    <div className="flex mt-1.5 -space-x-1.5">
                                        {event.avatars.slice(0, 3).map((src, idx) => (
                                            <div key={idx} className="relative h-4 w-4 rounded-full overflow-hidden border border-white">
                                                <Image src={src} alt="" fill className="object-cover" sizes="16px" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}

                    {/* Current time indicator */}
                    <div
                        className="absolute left-10 right-0 z-30 flex items-center pointer-events-none"
                        style={{ top: (new Date().getHours() - 9 + new Date().getMinutes() / 60) * ROW_HEIGHT }}
                    >
                        <div className="h-2 w-2 rounded-full bg-[#FF6B6B] -ml-1" />
                        <div className="flex-1 border-t-2 border-[#FF6B6B]" />
                    </div>
                </div>
            </div>

            {/* ── Floating event detail panel ── */}
            <AnimatePresence>
                {selectedEvent && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 10 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="absolute right-5 top-1/4 z-40 w-[250px] rounded-2xl border-2 border-[#0A0A0A] bg-white p-5 shadow-[4px_4px_0_#0A0A0A]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close */}
                        <button
                            onClick={() => setSelectedEvent(null)}
                            className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#0A0A0A]/5 text-[#0A0A0A]/40 hover:bg-[#0A0A0A]/10 transition-colors"
                        >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>

                        {/* Title */}
                        <h3
                            className="text-base font-bold text-[#0A0A0A] mb-3 pr-6"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            {selectedEvent.title}
                        </h3>

                        {/* Details */}
                        <div className="space-y-2.5 mb-4">
                            <div className="flex items-center gap-2.5 text-xs text-[#0A0A0A]/50">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                Friday, 7 March
                            </div>
                            <div className="flex items-center gap-2.5 text-xs text-[#0A0A0A]/50">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                {selectedEvent.time}
                            </div>
                            {selectedEvent.location && (
                                <div className="flex items-center gap-2.5 text-xs text-[#0A0A0A]/50">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    {selectedEvent.location}
                                </div>
                            )}
                        </div>

                        {/* Tags */}
                        {selectedEvent.tags && (
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {selectedEvent.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="rounded-full px-2.5 py-0.5 text-[10px] font-medium border"
                                        style={{
                                            backgroundColor: selectedEvent.bgColor,
                                            borderColor: `${selectedEvent.color}30`,
                                            color: selectedEvent.color,
                                            fontFamily: "var(--font-heading)",
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Participants */}
                        {selectedEvent.avatars && (
                            <div className="flex items-center gap-1.5 mb-4">
                                {selectedEvent.avatars.map((src, idx) => (
                                    <div key={idx} className="relative h-7 w-7 rounded-full overflow-hidden border-2 border-white shadow-sm">
                                        <Image src={src} alt="" fill className="object-cover" sizes="28px" />
                                    </div>
                                ))}
                                <button className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[#0A0A0A]/20 text-[#0A0A0A]/30 text-xs hover:border-[#0A0A0A]/40 transition-colors">
                                    +
                                </button>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="flex-1 rounded-xl bg-[#FFE600] border-2 border-[#0A0A0A] py-2 text-xs font-bold text-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                Join Meeting
                            </motion.button>
                            <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#0A0A0A]/10 text-[#0A0A0A]/30 hover:bg-[#0A0A0A]/5 transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

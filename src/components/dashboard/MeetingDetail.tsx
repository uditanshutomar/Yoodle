"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { MeetingRecord } from "./meetingsData";

type Tab = "overview" | "mom" | "transcript" | "recording";

const TAB_ICONS: Record<Tab, React.ReactNode> = {
    overview: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>,
    mom: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
    transcript: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
    recording: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>,
};

const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "mom", label: "MoM" },
    { key: "transcript", label: "Transcript" },
    { key: "recording", label: "Recording" },
];

// NOTE: The parent uses `key={meeting.id}` so React remounts this component
// when the meeting changes, naturally resetting all state to initial values.
export default function MeetingDetail({
    meeting,
    onClose,
}: {
    meeting: MeetingRecord;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<Tab>("overview");
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-[var(--foreground)]/30 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer */}
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative ml-auto flex h-full w-full max-w-[960px] flex-col bg-[var(--background)] border-l-2 border-[var(--border-strong)] shadow-2xl"
            >
                {/* ── HEADER ── */}
                <div className="flex-shrink-0 border-b-2 border-[var(--border)] bg-[var(--surface)] px-8 py-5">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {/* Back + title */}
                            <div className="flex items-center gap-3 mb-2">
                                <motion.button
                                    whileHover={{ x: -2 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onClose}
                                    className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[#FFE600]/20 hover:border-[var(--border-strong)] transition-colors"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                                </motion.button>
                                <div>
                                    <h1
                                        className="text-xl font-black text-[var(--text-primary)]"
                                        style={{ fontFamily: "var(--font-heading)" }}
                                    >
                                        {meeting.title}
                                    </h1>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs text-[var(--text-secondary)]">{meeting.date} · {meeting.time}</span>
                                        <span className="text-[var(--text-muted)]">·</span>
                                        <span className="text-xs text-[var(--text-muted)]">{meeting.duration}</span>
                                        <span className="text-[var(--text-muted)]">·</span>
                                        <span className="text-xs text-[var(--text-muted)]">{meeting.roomType}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Participants */}
                            <div className="flex items-center gap-2 mt-3">
                                {meeting.avatars.map((a, i) => (
                                    <div key={i} className="flex items-center gap-1.5 rounded-full bg-[var(--surface-hover)] px-2 py-1">
                                        <div className="relative h-5 w-5 rounded-full overflow-hidden border border-[var(--surface)]">
                                            <Image src={a.src} alt={a.name} fill className="object-cover" sizes="20px" />
                                        </div>
                                        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{a.name}</span>
                                        {a.role && <span className="text-[9px] text-[var(--text-muted)]">{a.role}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick share actions */}
                        <div className="flex items-center gap-2 mt-1">
                            {meeting.project && (
                                <span
                                    className="rounded-full px-2.5 py-1 text-[10px] font-bold border"
                                    style={{ backgroundColor: `${meeting.projectColor}15`, borderColor: `${meeting.projectColor}30`, color: meeting.projectColor, fontFamily: "var(--font-heading)" }}
                                >
                                    {meeting.project}
                                </span>
                            )}
                            <button className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[#FFE600]/20 hover:border-[var(--border-strong)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                                Copy link
                            </button>
                            <button className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[#FFE600]/20 hover:border-[var(--border-strong)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                                Share
                            </button>
                        </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex items-center gap-2 mt-3">
                        {meeting.hasSummary && <span className="text-[9px] font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-full px-2 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>✓ Summary ready</span>}
                        {meeting.hasTranscript && <span className="text-[9px] font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-2 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>✓ Transcript</span>}
                        {meeting.hasRecording && <span className="text-[9px] font-bold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-full px-2 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>● Recording</span>}
                    </div>
                </div>

                {/* ── TABS ── */}
                <div className="flex-shrink-0 bg-[var(--surface)] border-b-2 border-[var(--border)] px-8">
                    <div className="flex items-center gap-1">
                        {TABS.map((t) => {
                            const disabled = (t.key === "transcript" && !meeting.hasTranscript) ||
                                (t.key === "recording" && !meeting.hasRecording) ||
                                (t.key === "mom" && !meeting.mom);
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => !disabled && setTab(t.key)}
                                    disabled={disabled}
                                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${tab === t.key
                                        ? "border-[var(--border-strong)] text-[var(--text-primary)]"
                                        : disabled
                                            ? "border-transparent text-[var(--text-muted)] cursor-not-allowed"
                                            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    {TAB_ICONS[t.key]} {t.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── BODY: content + action sidebar ── */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Main content */}
                    <div className="flex-1 overflow-y-auto p-8">
                        <AnimatePresence mode="wait">
                            {tab === "overview" && <OverviewTab key="overview" meeting={meeting} />}
                            {tab === "mom" && meeting.mom && <MoMTab key="mom" meeting={meeting} />}
                            {tab === "transcript" && meeting.transcript && <TranscriptTab key="transcript" meeting={meeting} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
                            {tab === "recording" && <RecordingTab key="recording" meeting={meeting} />}
                        </AnimatePresence>
                    </div>

                    {/* Action sidebar */}
                    <div className="w-[220px] flex-shrink-0 border-l-2 border-[var(--border)] bg-[var(--surface)] p-5 overflow-y-auto">
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                            Quick actions
                        </p>
                        <div className="space-y-1.5">
                            {[
                                { label: "Create MoM", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>, available: true },
                                { label: "Copy summary", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>, available: meeting.hasSummary },
                                { label: "Download transcript", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>, available: meeting.hasTranscript },
                                { label: "Open recording", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>, available: meeting.hasRecording },
                                { label: "Share notes", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>, available: true },
                                { label: "Create follow-up", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, available: true },
                            ].map((action) => (
                                <motion.button
                                    key={action.label}
                                    whileHover={action.available ? { x: 2 } : {}}
                                    className={`flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all ${action.available
                                        ? "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                                        : "text-[var(--text-muted)] cursor-not-allowed"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    {action.icon}
                                    {action.label}
                                </motion.button>
                            ))}
                        </div>

                        {/* Action items from meeting */}
                        {meeting.mom?.actionItems && (
                            <div className="mt-6">
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                                    Action items
                                </p>
                                <div className="space-y-2">
                                    {meeting.mom.actionItems.map((item, i) => (
                                        <div key={i} className="rounded-lg border-[1.5px] border-[var(--border)] p-2.5">
                                            <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-snug mb-1">{item.task}</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-[var(--text-muted)] font-medium">{item.owner}</span>
                                                <span className="text-[9px] text-[#F59E0B] font-bold">{item.due}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

/* ═══ TAB COMPONENTS ═══ */

function OverviewTab({ meeting }: { meeting: MeetingRecord }) {
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {meeting.overview && (
                <div className="space-y-5">
                    <Section title="Purpose" content={meeting.overview.purpose} />
                    <Section title="Outcome" content={meeting.overview.outcome} />
                    {meeting.overview.nextMeeting && (
                        <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-4">
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5" style={{ fontFamily: "var(--font-heading)" }}>Next meeting</p>
                            <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> {meeting.overview.nextMeeting}
                            </p>
                        </div>
                    )}

                    {/* Quick stats */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: "Duration", value: meeting.duration, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
                            { label: "Participants", value: `${meeting.avatars.length}`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
                            { label: "Action items", value: `${meeting.mom?.actionItems?.length || 0}`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
                        ].map((stat) => (
                            <div key={stat.label} className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-4 text-center">
                                <span className="mb-1 block">{stat.icon}</span>
                                <p className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>{stat.value}</p>
                                <p className="text-[10px] text-[var(--text-muted)] font-medium">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

function MoMTab({ meeting }: { meeting: MeetingRecord }) {
    const mom = meeting.mom!;
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Key decisions */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg> Key decisions</p>
                <ul className="space-y-2">
                    {mom.keyDecisions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                            <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                            {d}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Discussion */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> Discussion points</p>
                <ul className="space-y-2">
                    {mom.discussionPoints.map((d, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                            <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                            {d}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Action items */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> Action items</p>
                <div className="space-y-2">
                    {mom.actionItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl bg-[var(--background)] px-3.5 py-2.5">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-4 w-4 items-center justify-center rounded border border-[var(--border)] text-[8px]" />
                                <span className="text-sm text-[var(--text-secondary)]">{item.task}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-medium text-[var(--text-secondary)]">{item.owner}</span>
                                <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 rounded-full px-2 py-0.5">{item.due}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Next steps */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg> Next steps</p>
                <ul className="space-y-2">
                    {mom.nextSteps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                            <span className="flex-shrink-0 mt-1.5 text-xs">&rarr;</span>
                            {s}
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
}

function TranscriptTab({ meeting, searchQuery, setSearchQuery }: { meeting: MeetingRecord; searchQuery: string; setSearchQuery: (q: string) => void }) {
    const transcript = meeting.transcript!;
    const filtered = searchQuery
        ? transcript.filter((e) => e.text.toLowerCase().includes(searchQuery.toLowerCase()) || e.speaker.toLowerCase().includes(searchQuery.toLowerCase()))
        : transcript;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Search */}
            <div className="mb-4 flex items-center gap-2 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--text-muted)]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search transcript..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                    style={{ fontFamily: "var(--font-body)" }}
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">Clear</button>
                )}
            </div>

            {/* Transcript entries */}
            <div className="space-y-1">
                {filtered.map((entry, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--surface)] transition-colors group"
                    >
                        <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)] font-mono pt-0.5 w-8">{entry.time}</span>
                        <div className="flex-1">
                            <span className="text-[11px] font-bold text-[var(--text-secondary)] mr-2" style={{ fontFamily: "var(--font-heading)" }}>{entry.speaker}</span>
                            <span className="text-sm text-[var(--text-secondary)] leading-relaxed">{entry.text}</span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

function RecordingTab({ meeting }: { meeting: MeetingRecord }) {
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Video preview */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--foreground)] overflow-hidden relative" style={{ aspectRatio: "16/9" }}>
                {meeting.recordingUrl ? (
                    <Image src={meeting.recordingUrl} alt="Recording" fill className="object-cover opacity-80" sizes="(max-width: 960px) 100vw, 960px" unoptimized />
                ) : (
                    <div className="flex items-center justify-center h-full text-white/30 text-sm">No recording preview</div>
                )}
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--foreground)"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </motion.button>
                </div>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                    <div className="h-full w-[35%] bg-[#FFE600] rounded-r-full" />
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-4">
                    <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></svg>
                    </button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--foreground)] text-white">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </motion.button>
                    <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                    </button>
                </div>
                <span className="text-xs text-[var(--text-muted)] font-mono">15:42 / {meeting.duration}</span>
                <div className="flex items-center gap-2">
                    <button className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-2 py-1 rounded-lg hover:bg-[var(--surface-hover)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>1x</button>
                    <button className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                    </button>
                </div>
            </div>

            {/* Key moments */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg> Key moments</p>
                <div className="space-y-2">
                    {[
                        { time: "0:45", label: "Competitor analysis overview" },
                        { time: "2:15", label: "Accessibility concerns raised" },
                        { time: "3:30", label: "Palette confirmed" },
                        { time: "5:00", label: "Typography decision deferred" },
                    ].map((m, i) => (
                        <motion.button
                            key={i}
                            whileHover={{ x: 2 }}
                            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--background)] transition-colors"
                        >
                            <span className="text-[10px] text-[var(--text-muted)] font-mono w-8">{m.time}</span>
                            <span className="text-xs text-[var(--text-secondary)]">{m.label}</span>
                        </motion.button>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

/* ─── Helpers ─── */
function Section({ title, content }: { title: string; content: string }) {
    return (
        <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2" style={{ fontFamily: "var(--font-heading)" }}>{title}</p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{content}</p>
        </div>
    );
}

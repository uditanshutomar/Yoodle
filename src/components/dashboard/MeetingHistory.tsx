"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { MeetingRecord, APIMeeting, apiMeetingToRecord } from "./meetingsData";

export default function MeetingHistory({
    onSelectMeeting,
}: {
    onSelectMeeting: (m: MeetingRecord) => void;
}) {
    const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function fetchMeetings() {
            try {
                const res = await fetch("/api/meetings?status=ended&limit=20", {
                    credentials: "include",
                });
                if (!res.ok) throw new Error("Failed to fetch");
                const data = await res.json();
                if (cancelled) return;

                const apiMeetings: APIMeeting[] = data.data || [];
                const records = apiMeetings.map(apiMeetingToRecord);
                setMeetings(records);
            } catch (err) {
                console.warn("[MeetingHistory] Failed to fetch meetings:", err);
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchMeetings();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return (
            <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2
                        className="text-sm font-bold text-[var(--text-primary)]"
                        style={{ fontFamily: "var(--font-heading)" }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Past meetings
                    </h2>
                </div>
                <div className="animate-pulse space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-[var(--surface-hover)] rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 25 }}
            className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden p-4"
        >
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Past meetings
                </h2>
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                    {meetings.length} total
                </span>
            </div>

            {error ? (
                <p className="text-xs text-[#FF6B6B]/70 text-center py-6">Couldn&apos;t load meetings. Try refreshing.</p>
            ) : meetings.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-6">No past meetings yet. Create your first room!</p>
            ) : (
                <div className="space-y-1.5" role="list" aria-label="Past meetings">
                    {meetings.map((m, i) => (
                        <motion.div
                            key={m.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`View meeting: ${m.title}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            whileHover={{ x: 2 }}
                            onClick={() => onSelectMeeting(m)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectMeeting(m); } }}
                            className="rounded-xl border-[1.5px] border-[var(--border)] p-2.5 cursor-pointer hover:border-[var(--border-strong)] transition-all bg-[var(--surface)]"
                        >
                            <div className="flex items-center justify-between mb-1">
                                {m.project ? (
                                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${m.projectColor}15`, color: m.projectColor, fontFamily: "var(--font-heading)" }}>
                                        {m.project}
                                    </span>
                                ) : (
                                    <span />
                                )}
                                <span className="text-[10px] text-[var(--text-muted)]">{m.duration}</span>
                            </div>

                            <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug mb-1.5">{m.title}</p>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-1.5">
                                        {m.avatars.slice(0, 3).map((a, idx) => (
                                            <div key={idx} className="relative h-[18px] w-[18px] rounded-full overflow-hidden border-2 border-[var(--surface)]" title={a.name}>
                                                <Image src={a.src} alt={a.name} fill className="object-cover" sizes="18px" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {m.hasSummary && (
                                            <span className="text-[8px] font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-full px-1.5 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>MoM</span>
                                        )}
                                        {m.hasTranscript && (
                                            <span className="text-[8px] font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-1.5 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>TXT</span>
                                        )}
                                        {m.hasRecording && (
                                            <span className="text-[8px] font-bold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-full px-1.5 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>REC</span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[10px] text-[var(--text-muted)]">{m.date}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

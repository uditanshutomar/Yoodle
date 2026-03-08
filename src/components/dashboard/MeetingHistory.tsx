"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { MEETINGS_DATA, MeetingRecord } from "./meetingsData";

export default function MeetingHistory({ onSelectMeeting }: { onSelectMeeting: (m: MeetingRecord) => void }) {
    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 25 }}
            className="rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[4px_4px_0_#0A0A0A] overflow-hidden p-4"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h2
                    className="text-sm font-bold text-[#0A0A0A]"
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    Past meetings
                </h2>
                <span
                    className="text-[10px] font-bold text-[#0A0A0A]/30 uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    {MEETINGS_DATA.length} total
                </span>
            </div>

            {/* Scrollable meeting cards */}
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                {MEETINGS_DATA.map((m, i) => (
                    <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        whileHover={{ x: 2 }}
                        onClick={() => onSelectMeeting(m)}
                        className="rounded-xl border-[1.5px] border-[#0A0A0A]/15 p-2.5 cursor-pointer hover:border-[#0A0A0A]/40 hover:shadow-[2px_2px_0_rgba(10,10,10,0.08)] transition-all bg-white"
                    >
                        {/* Top: project tag + duration */}
                        <div className="flex items-center justify-between mb-1">
                            {m.project ? (
                                <span
                                    className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                    style={{
                                        backgroundColor: `${m.projectColor}15`,
                                        color: m.projectColor,
                                        fontFamily: "var(--font-heading)",
                                    }}
                                >
                                    {m.project}
                                </span>
                            ) : (
                                <span />
                            )}
                            <span className="text-[10px] text-[#0A0A0A]/25">{m.duration}</span>
                        </div>

                        {/* Title */}
                        <p className="text-[13px] font-semibold text-[#0A0A0A] leading-snug mb-1.5">{m.title}</p>

                        {/* Bottom: avatars + badges + time */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="flex -space-x-1.5">
                                    {m.avatars.slice(0, 3).map((a, idx) => (
                                        <div key={idx} className="relative h-[18px] w-[18px] rounded-full overflow-hidden border-2 border-white" title={a.name}>
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
                            <span className="text-[10px] text-[#0A0A0A]/30">{m.date}</span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CalendarPanel from "./CalendarPanel";
import ProjectTracker from "./ProjectTracker";
import MeetingHistory from "./MeetingHistory";
import MeetingDetail from "./MeetingDetail";
import { MeetingRecord } from "./meetingsData";
import { DoodleStar, DoodleSquiggle, DoodleSparkles } from "@/components/Doodles";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function Dashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const [mode, setMode] = useState<"lockin" | "invisible" | "social">("lockin");
    const [joinCode, setJoinCode] = useState("");
    const [mascotMsg, setMascotMsg] = useState("Design sync starts in 12 min. Want me to pull up your notes?");
    const [showMascotChat, setShowMascotChat] = useState(false);
    const [timeStr, setTimeStr] = useState("");
    const [dateStr, setDateStr] = useState("");
    const [greeting, setGreeting] = useState("");
    const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);

    const firstName = user?.name?.split(" ")[0] || user?.displayName?.split(" ")[0] || "there";

    useEffect(() => {
        const update = () => {
            const now = new Date();
            const h = now.getHours();
            setTimeStr(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
            setDateStr(now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }));
            setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
        };
        update();
        const i = setInterval(update, 30000);
        return () => clearInterval(i);
    }, []);

    const handleJoin = () => {
        const code = joinCode.trim();
        if (!code) return;
        router.push(`/meetings/join?code=${code}`);
    };

    return (
        <div className="dashboard-root relative overflow-hidden" style={{ minHeight: "calc(100vh - 56px)" }}>
            {/* Doodle decorations — very subtle background flair */}
            <div className="pointer-events-none absolute inset-0 z-[1]">
                <DoodleStar className="absolute top-20 left-[30%] opacity-40" color="#FFE600" size={20} />
                <DoodleStar className="absolute bottom-32 left-[15%] opacity-30" color="#0A0A0A" size={14} />
                <DoodleSparkles className="absolute top-40 right-[42%] opacity-20" />
                <DoodleSquiggle className="absolute bottom-20 right-[35%] opacity-15" />
            </div>

            {/* ─── MAIN LAYOUT: center-left action + right planning ─── */}
            <div className="relative z-10 flex px-8 gap-6 mt-2" style={{ minHeight: "calc(100vh - 136px)" }}>

                {/* ═══ LEFT: Main action area ═══ */}
                <div className="flex-1 flex flex-col justify-center pb-32 max-w-[640px]">
                    <motion.div
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1, type: "spring", stiffness: 180, damping: 25 }}
                    >
                        {/* Greeting */}
                        <p className="text-sm text-[#0A0A0A]/40 mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                            {greeting}, {firstName} 👋
                        </p>

                        {/* Main heading */}
                        <h1
                            className="text-5xl font-black text-[#0A0A0A] leading-[1.1] mb-2"
                            style={{ fontFamily: "var(--font-heading)", textShadow: "3px 3px 0 #FFE600" }}
                        >
                            What are we<br />working on?
                        </h1>

                        {/* Subtitle */}
                        <p className="text-base text-[#0A0A0A]/40 mb-10 max-w-md leading-relaxed">
                            {mode === "lockin"
                                ? "Lock in mode. Notifications paused, distractions off."
                                : mode === "invisible"
                                    ? "You're invisible. No one can see you're online."
                                    : "Social mode — you're visible to nearby teammates."}
                        </p>

                        {/* ── Two main actions ── */}
                        <div className="flex items-center gap-4 mb-8">
                            <motion.a
                                href="/meetings/new"
                                whileHover={{ scale: 1.03, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                className="flex items-center gap-3 rounded-2xl bg-[#FFE600] border-2 border-[#0A0A0A] px-7 py-4 shadow-[5px_5px_0_#0A0A0A] hover:shadow-[3px_3px_0_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                <span className="text-base font-bold text-[#0A0A0A]">Create room</span>
                            </motion.a>

                            <span className="text-[#0A0A0A]/15 text-sm font-medium" style={{ fontFamily: "var(--font-heading)" }}>or</span>

                            {/* Join room with code */}
                            <div className="flex items-center rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[5px_5px_0_#0A0A0A] overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-4">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={joinCode}
                                        onChange={(e) => setJoinCode(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                                        placeholder="Enter room code"
                                        className="bg-transparent text-sm text-[#0A0A0A] outline-none placeholder:text-[#0A0A0A]/25 w-36"
                                        style={{ fontFamily: "var(--font-body)" }}
                                    />
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleJoin}
                                    className="h-full bg-[#0A0A0A] px-5 py-4 text-sm font-bold text-white border-l-2 border-[#0A0A0A]"
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    Join
                                </motion.button>
                            </div>
                        </div>

                        {/* Mode toggle — compact inline version */}
                        <div className="mb-8">
                            <motion.div
                                className="inline-flex items-center gap-1 rounded-full border-2 border-[#0A0A0A] bg-white px-1 py-1 shadow-[3px_3px_0_#0A0A0A]"
                            >
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setMode("lockin")}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${mode === "lockin"
                                        ? "bg-[#FFE600] text-[#0A0A0A] shadow-[1px_1px_0_#0A0A0A]"
                                        : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    🔒 Lock in
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setMode("invisible")}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${mode === "invisible"
                                        ? "bg-[#0A0A0A]/10 text-[#0A0A0A] shadow-[1px_1px_0_#0A0A0A]/20"
                                        : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    👻 Invisible
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setMode("social")}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${mode === "social"
                                        ? "bg-[#7C3AED] text-white shadow-[1px_1px_0_#0A0A0A]"
                                        : "text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    🌈 Social
                                </motion.button>
                            </motion.div>
                        </div>

                        {/* Past meetings card */}
                        <div className="mt-2">
                            <MeetingHistory onSelectMeeting={(m) => setSelectedMeeting(m)} />
                        </div>
                    </motion.div>
                </div>

                {/* ═══ RIGHT: Planning column ═══ */}
                <div className="w-[380px] flex-shrink-0 py-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 136px)" }}>
                    <CalendarPanel />
                    <div className="mt-4">
                        <ProjectTracker />
                    </div>
                </div>
            </div>

            {/* ─── MASCOT: bottom-left speech bubble companion ─── */}
            <div className="fixed bottom-6 left-[280px] z-50 flex items-end gap-3">
                {/* Mascot avatar */}
                <motion.button
                    whileHover={{ scale: 1.1, rotate: -5 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowMascotChat(!showMascotChat)}
                    className={`flex items-center justify-center rounded-full bg-[#FFE600] border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] flex-shrink-0 overflow-hidden ${!showMascotChat ? "w-[68px] h-[68px]" : "w-10 h-10"}`}
                >
                    {mode === "lockin" ? (
                        <img src="/mascot-lockin.png" alt="Lock in mascot" className="h-full w-full object-cover" />
                    ) : mode === "invisible" ? (
                        <img src="/mascot-invisible.png" alt="Invisible mascot" className="h-full w-full object-cover" />
                    ) : (
                        <img src="/mascot-social.png" alt="Social mascot" className="h-full w-full object-cover" />
                    )}
                </motion.button>

                {/* Speech bubble */}
                <AnimatePresence>
                    {!showMascotChat && (
                        <motion.div
                            initial={{ opacity: 0, x: -10, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="relative rounded-2xl border-2 border-[#0A0A0A] bg-white px-4 py-3 shadow-[3px_3px_0_#0A0A0A] max-w-[280px]"
                        >
                            {/* Triangle pointer */}
                            <div className="absolute left-[-8px] bottom-4 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-[#0A0A0A]" />
                            <div className="absolute left-[-5px] bottom-4 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[7px] border-r-white" />
                            <p className="text-xs text-[#0A0A0A]/60 leading-relaxed">
                                <span className="font-bold text-[#0A0A0A]/80">🤖</span> {mascotMsg}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Expanded chat */}
                <AnimatePresence>
                    {showMascotChat && (
                        <MascotChat onClose={() => setShowMascotChat(false)} />
                    )}
                </AnimatePresence>
            </div>

            {/* Meeting Detail Drawer */}
            <AnimatePresence>
                {selectedMeeting && (
                    <MeetingDetail meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Inline Mascot Chat ─── */
function MascotChat({ onClose }: { onClose: () => void }) {
    const [message, setMessage] = useState("");
    const [chat, setChat] = useState<Array<{ from: "user" | "ai"; text: string }>>([
        { from: "ai", text: "Hey! Need help with anything? I can prep you for meetings, find docs, or start a room." },
    ]);

    const handleSend = (text?: string) => {
        const msg = text || message;
        if (!msg.trim()) return;
        setChat((prev) => [...prev, { from: "user", text: msg }]);
        setMessage("");
        setTimeout(() => {
            setChat((prev) => [...prev, {
                from: "ai",
                text: msg.toLowerCase().includes("summarize")
                    ? "You have 3 meetings today, 2 follow-ups pending, and a doc review due. Want the details?"
                    : msg.toLowerCase().includes("room")
                        ? "Opening a room now. Maya and Kai are available! 🎨"
                        : "Got it — let me pull that up for you. 🔍",
            }]);
        }, 600);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[4px_4px_0_#0A0A0A] w-[300px] flex flex-col overflow-hidden"
            style={{ maxHeight: 360 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-[#0A0A0A] px-4 py-2.5 bg-[#FFE600]">
                <span className="text-sm font-bold" style={{ fontFamily: "var(--font-heading)" }}>🤖 Yoodle AI</span>
                <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} onClick={onClose}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0A0A0A] bg-white text-[8px] font-bold">
                    ✕
                </motion.button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chat.map((msg, i) => (
                    <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.from === "user"
                            ? "bg-[#FFE600] border border-[#0A0A0A] text-[#0A0A0A]"
                            : "bg-[#0A0A0A]/5 text-[#0A0A0A]/70"
                            }`}>{msg.text}</div>
                    </div>
                ))}
            </div>

            {/* Suggestions */}
            <div className="px-3 pb-1 flex gap-1 overflow-x-auto">
                {["Summarize my day", "Start a room"].map((s) => (
                    <button key={s} onClick={() => handleSend(s)}
                        className="flex-shrink-0 rounded-full border border-[#0A0A0A]/10 px-2.5 py-1 text-[10px] text-[#0A0A0A]/40 hover:bg-[#FFE600]/10 transition-colors whitespace-nowrap">
                        {s}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div className="border-t border-[#0A0A0A]/10 px-3 py-2">
                <div className="flex items-center gap-2 rounded-full border border-[#0A0A0A]/20 px-3 py-1.5">
                    <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Ask anything..." className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#0A0A0A]/20" />
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleSend()}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FFE600] border border-[#0A0A0A]">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="3"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}

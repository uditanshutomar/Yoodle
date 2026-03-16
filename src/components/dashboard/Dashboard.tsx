"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CalendarPanel from "./CalendarPanel";
import TasksPanel from "./TasksPanel";
import MeetingHistory from "./MeetingHistory";
import MeetingDetail from "./MeetingDetail";
import { MeetingRecord } from "./meetingsData";
import { useAuth } from "@/hooks/useAuth";
import { usePendingActions } from "@/hooks/usePendingActions";
import { useRouter } from "next/navigation";
import { useAIDrawer } from "@/components/ai/AIDrawer";
import { Bot } from "lucide-react";

export default function Dashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const aiDrawer = useAIDrawer();
    const [mode, setMode] = useState<"lockin" | "invisible" | "social">(
        (user?.mode as "lockin" | "invisible" | "social") || "social"
    );
    // Sync mode from server when user data loads
    const userMode = user?.mode as "lockin" | "invisible" | "social" | undefined;
    const prevUserModeRef = useRef(userMode);
    useEffect(() => {
        if (userMode && userMode !== prevUserModeRef.current) {
            prevUserModeRef.current = userMode;
            queueMicrotask(() => setMode(userMode));
        }
        // Persist default mode for new users who have no mode set yet
        if (user && !userMode) {
            fetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mode: "social" }),
            }).catch(() => {});
        }
    }, [userMode, user]);

    const handleModeChange = useCallback((newMode: "lockin" | "invisible" | "social") => {
        setMode(newMode);
        fetch("/api/users/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ mode: newMode }),
        }).catch(() => {});
    }, []);

    const [joinCode, setJoinCode] = useState("");
    const [greeting, setGreeting] = useState("");
    const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);

    // Pending actions state
    const { pendingActions, confirmAction, denyAction, reviseAction } = usePendingActions();

    const firstName = user?.name?.split(" ")[0] || user?.displayName?.split(" ")[0] || "";

    useEffect(() => {
        const update = () => {
            const h = new Date().getHours();
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
        <div className="dashboard-root">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-0 py-6 lg:py-10 space-y-8">

                {/* -- Greeting + Mode Toggle -- */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 180, damping: 25 }}
                >
                    <p className="text-sm text-[var(--text-muted)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                        {greeting}{firstName ? `, ${firstName}` : ""} 👋
                    </p>
                    <h1
                        className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight mb-3"
                        style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
                    >
                        What are we working on?
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md leading-relaxed">
                        {mode === "lockin"
                            ? "Lock in mode. Notifications paused, distractions off."
                            : mode === "invisible"
                                ? "You're invisible. No one can see you're online."
                                : "Social mode — you're visible to nearby teammates."}
                    </p>

                    {/* Mode toggle -- keep the existing compact inline version */}
                    <div className="mb-2">
                        <motion.div
                            className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] px-1 py-1 shadow-[3px_3px_0_var(--border-strong)]"
                        >
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleModeChange("lockin")}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${mode === "lockin"
                                    ? "bg-[#FFE600] text-[#0A0A0A] shadow-[1px_1px_0_var(--border-strong)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                🔒 Lock in
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleModeChange("invisible")}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${mode === "invisible"
                                    ? "bg-[var(--surface-hover)] text-[var(--text-primary)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                👻 Invisible
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleModeChange("social")}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${mode === "social"
                                    ? "bg-[#7C3AED] text-white shadow-[1px_1px_0_var(--border-strong)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                🌈 Social
                            </motion.button>
                        </motion.div>
                    </div>
                </motion.div>

                {/* -- Action Cards: Start + Join Meeting -- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Start Meeting */}
                    <motion.a
                        href="/meetings/new"
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-4 rounded-2xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-6 py-5 shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                        style={{ fontFamily: "var(--font-heading)" }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <div>
                            <span className="text-base font-bold text-[#0A0A0A] block">Start Meeting</span>
                            <span className="text-xs text-[#0A0A0A]/60">Create an instant or scheduled room</span>
                        </div>
                    </motion.a>

                    {/* Join Meeting */}
                    <div className="flex items-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
                        <div className="flex-1 flex items-center gap-3 px-5 py-5">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)] flex-shrink-0">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <input
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                                placeholder="Enter room code"
                                className="bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] w-full"
                                style={{ fontFamily: "var(--font-body)" }}
                            />
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleJoin}
                            className="h-full bg-[var(--foreground)] px-6 py-5 text-sm font-bold text-[var(--background)] border-l-2 border-[var(--border-strong)]"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            Join
                        </motion.button>
                    </div>
                </div>

                {/* -- AI Briefing Card -- */}
                <motion.button
                    onClick={() => aiDrawer.open()}
                    whileHover={{ scale: 1.01 }}
                    className="w-full text-left rounded-2xl border-2 border-[#FFE600] bg-[#FFE600]/5 px-5 py-4 transition-colors hover:bg-[#FFE600]/10"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Bot size={18} className="text-[#FFE600]" />
                        <span className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                            AI Briefing
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-auto">Tap for details &rarr;</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        Ask Doodle Poodle to summarize your day, prep for meetings, or check what&apos;s pending.
                    </p>
                </motion.button>

                {/* -- Recent Meetings -- */}
                <MeetingHistory onSelectMeeting={(m) => setSelectedMeeting(m)} />

                {/* -- Calendar + Tasks side-by-side -- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <CalendarPanel />
                    <TasksPanel
                        pendingActions={pendingActions}
                        onConfirmAction={confirmAction}
                        onDenyAction={denyAction}
                        onReviseAction={reviseAction}
                    />
                </div>

            </div>

            {/* Meeting Detail Drawer -- keep existing */}
            <AnimatePresence>
                {selectedMeeting && (
                    <MeetingDetail key={selectedMeeting.id} meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import MeetingPulse from "./MeetingPulse";
import { MeetingRecord } from "./meetingsData";

const CalendarPanel = dynamic(() => import("./CalendarPanel"), {
    ssr: false,
    loading: () => (
        <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] h-[420px] animate-pulse shadow-[4px_4px_0_var(--border-strong)]" />
    ),
});

const TasksBoardPanel = dynamic(() => import("./TasksBoardPanel"), {
    ssr: false,
    loading: () => (
        <div className="h-[200px] animate-pulse rounded-xl bg-[var(--surface-hover)]" />
    ),
});

const MeetingHistory = dynamic(() => import("./MeetingHistory"), {
    ssr: false,
    loading: () => (
        <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] h-[200px] animate-pulse shadow-[4px_4px_0_var(--border-strong)]" />
    ),
});

const MeetingDetail = dynamic(() => import("./MeetingDetail"), {
    ssr: false,
});

const TeamMap = dynamic(() => import("./TeamMap"), {
    ssr: false,
    loading: () => (
        <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] h-[300px] animate-pulse shadow-[4px_4px_0_var(--border-strong)]" />
    ),
});

const ActionItemTracker = dynamic(() => import("./ActionItemTracker"), {
    ssr: false,
    loading: () => (
        <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] h-[120px] animate-pulse shadow-[4px_4px_0_var(--border-strong)]" />
    ),
});
import { useAuth } from "@/hooks/useAuth";
import { usePendingActions } from "@/hooks/usePendingActions";
import { useRouter } from "next/navigation";
import { useAIDrawer } from "@/components/ai/AIDrawer";
import Image from "next/image";

export default function Dashboard() {
    const { user, refreshSession } = useAuth();
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
        })
            .then(() => refreshSession())
            .catch(() => {});
    }, [refreshSession]);

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
                            role="radiogroup"
                            aria-label="Status mode"
                            className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] px-1 py-1 shadow-[3px_3px_0_var(--border-strong)]"
                        >
                            <motion.button
                                role="radio"
                                aria-checked={mode === "lockin"}
                                aria-label="Lock in mode"
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
                                role="radio"
                                aria-checked={mode === "invisible"}
                                aria-label="Invisible mode"
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
                                role="radio"
                                aria-checked={mode === "social"}
                                aria-label="Social mode"
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
                        aria-label="Start a new meeting"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)] flex-shrink-0" aria-hidden="true">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <label htmlFor="join-room-code" className="sr-only">Room code</label>
                            <input
                                id="join-room-code"
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                                placeholder="Enter room code"
                                aria-label="Enter room code to join a meeting"
                                className="bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] w-full"
                                style={{ fontFamily: "var(--font-body)" }}
                            />
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleJoin}
                            aria-label="Join meeting with room code"
                            className="h-full bg-[var(--foreground)] px-6 py-5 text-sm font-bold text-[var(--background)] border-l-2 border-[var(--border-strong)]"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            Join
                        </motion.button>
                    </div>
                </div>

                {/* -- Calendar + Tasks/AI side-by-side -- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    <div>
                        <CalendarPanel />
                    </div>
                    <div className="flex flex-col gap-4">
                        {/* Tasks Card */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 25 }}
                            className="flex-1 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden"
                        >
                            <div className="h-full p-4">
                                <TasksBoardPanel
                                    pendingActions={pendingActions}
                                    onConfirmAction={confirmAction}
                                    onDenyAction={denyAction}
                                    onReviseAction={reviseAction}
                                />
                            </div>
                        </motion.div>

                        {/* Meeting Pulse */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.27, type: "spring", stiffness: 200, damping: 25 }}
                        >
                            <MeetingPulse />
                        </motion.div>

                        {/* Action Item Tracker */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.28, type: "spring", stiffness: 200, damping: 25 }}
                        >
                            <ActionItemTracker />
                        </motion.div>

                        {/* AI Briefing Card */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 25 }}
                            role="button"
                            tabIndex={0}
                            aria-label="Open AI assistant - Doodle Poodle"
                            className="flex-1 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden cursor-pointer hover:shadow-[2px_2px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                            onClick={() => aiDrawer.open()}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aiDrawer.open(); } }}
                        >
                            <div className="h-full p-4 flex flex-col">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] overflow-hidden">
                                        <Image src={mode === "lockin" ? "/mascot-lockin.png" : mode === "invisible" ? "/mascot-invisible.png" : "/mascot-social.png"} alt="Yoodle" width={28} height={28} className="mix-blend-multiply object-cover" />
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold text-[var(--text-primary)] block" style={{ fontFamily: "var(--font-heading)" }}>
                                            Doodle Poodle
                                        </span>
                                        <span className="text-[10px] text-[var(--text-muted)]">Your AI meeting buddy</span>
                                    </div>
                                    <span className="text-[10px] text-[var(--text-muted)] ml-auto font-medium" style={{ fontFamily: "var(--font-heading)" }}>⌘J &rarr;</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 flex-1">
                                    {[
                                        { label: "Summarize my day", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
                                        { label: "Prep for meeting", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
                                        { label: "Draft follow-up", icon: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" },
                                        { label: "What's pending?", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2" },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="flex items-center gap-2 px-3 py-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[#FFE600] hover:bg-[#FFE600]/10 transition-colors group"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)] group-hover:text-[#B8860B] transition-colors flex-shrink-0">
                                                <path d={item.icon} />
                                            </svg>
                                            <span className="text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" style={{ fontFamily: "var(--font-body)" }}>
                                                {item.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* -- Past Meetings -- */}
                <MeetingHistory onSelectMeeting={(m) => setSelectedMeeting(m)} />

                {/* -- Nearby Yoodlers Map -- */}
                <TeamMap active={mode === "social"} />

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

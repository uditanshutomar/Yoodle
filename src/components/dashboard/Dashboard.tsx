"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import CalendarPanel from "./CalendarPanel";
import TasksPanel from "./TasksPanel";
import MeetingHistory from "./MeetingHistory";
import MeetingDetail from "./MeetingDetail";
import { MeetingRecord } from "./meetingsData";
import TeamMap from "./TeamMap";
import { DoodleStar, DoodleSquiggle, DoodleSparkles } from "@/components/Doodles";
import VoiceInputButton from "@/components/chat/VoiceInputButton";
import ChatBubble from "@/components/ai/ChatBubble";
import { useAuth } from "@/hooks/useAuth";
import { useAIChat, ChatMessage } from "@/hooks/useAIChat";
import { usePendingActions } from "@/hooks/usePendingActions";
import { useRouter } from "next/navigation";

export default function Dashboard() {
    const { user } = useAuth();
    const router = useRouter();
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
    const [showMascotChat, setShowMascotChat] = useState(false);
    const [mascotMsg, setMascotMsg] = useState("");
    const [greeting, setGreeting] = useState("");
    const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);

    // Lifted AI chat state — shared with MascotChat
    const { messages, isStreaming, sendMessage, stopStreaming, clearMessages, setOnPendingAction } = useAIChat();

    // Pending actions state
    const { pendingActions, addAction, confirmAction, denyAction, reviseAction } = usePendingActions();

    // Wire pending action callback from AI chat to pending actions store
    useEffect(() => {
        setOnPendingAction((data: Record<string, unknown>) => {
            addAction({
                actionId: data.actionId as string,
                actionType: data.actionType as string,
                args: data.args as Record<string, unknown>,
                summary: data.summary as string,
            });
        });
    }, [setOnPendingAction, addAction]);

    const firstName = user?.name?.split(" ")[0] || user?.displayName?.split(" ")[0] || "";

    useEffect(() => {
        let mascotSet = false;
        const update = () => {
            const h = new Date().getHours();
            setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
            // Set mascot message once, client-side only to avoid hydration mismatch
            if (!mascotSet) {
                mascotSet = true;
                const tips = h < 12
                    ? ["Ready to crush it today? I can pull up your agenda!", "Morning! Want me to summarize what you missed?"]
                    : h < 17
                        ? ["Need a quick stand-up room? I got you!", "Want me to recap your last meeting notes?"]
                        : ["Wrapping up? I can draft your end-of-day summary.", "Late session! Want me to set up a focus room?"];
                setMascotMsg(tips[Math.floor(Math.random() * tips.length)]);
            }
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
                <DoodleStar className="absolute bottom-32 left-[15%] opacity-30" color="var(--text-primary)" size={14} />
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
                        <p className="text-sm text-[var(--text-muted)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                            {greeting}{firstName ? `, ${firstName}` : ""} 👋
                        </p>

                        {/* Main heading */}
                        <h1
                            className="text-5xl font-black text-[var(--text-primary)] leading-[1.1] mb-2"
                            style={{ fontFamily: "var(--font-heading)", textShadow: "3px 3px 0 #FFE600" }}
                        >
                            What are we<br />working on?
                        </h1>

                        {/* Subtitle */}
                        <p className="text-base text-[var(--text-muted)] mb-10 max-w-md leading-relaxed">
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
                                className="flex items-center gap-3 rounded-2xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-7 py-4 shadow-[5px_5px_0_var(--border-strong)] hover:shadow-[3px_3px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                <span className="text-base font-bold text-[#0A0A0A]">Create room</span>
                            </motion.a>

                            <span className="text-[var(--text-muted)] text-sm font-medium" style={{ fontFamily: "var(--font-heading)" }}>or</span>

                            {/* Join room with code */}
                            <div className="flex items-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[5px_5px_0_var(--border-strong)] overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-4">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={joinCode}
                                        onChange={(e) => setJoinCode(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                                        placeholder="Enter room code"
                                        className="bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] w-36"
                                        style={{ fontFamily: "var(--font-body)" }}
                                    />
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleJoin}
                                    className="h-full bg-[var(--foreground)] px-5 py-4 text-sm font-bold text-[var(--background)] border-l-2 border-[var(--border-strong)]"
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    Join
                                </motion.button>
                            </div>
                        </div>

                        {/* Mode toggle — compact inline version */}
                        <div className="mb-8">
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

                        {/* Teammate Map — shows nearby teammates in social mode */}
                        <div className="mb-6">
                            <TeamMap active={mode === "social"} />
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
                        <TasksPanel
                            pendingActions={pendingActions}
                            onConfirmAction={confirmAction}
                            onDenyAction={denyAction}
                            onReviseAction={reviseAction}
                        />
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
                    className={`flex items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] flex-shrink-0 overflow-hidden ${!showMascotChat ? "w-[68px] h-[68px]" : "w-10 h-10"}`}
                >
                    {mode === "lockin" ? (
                        <Image src="/mascot-lockin.png" alt="Lock in mascot" width={68} height={68} className="h-full w-full object-cover" />
                    ) : mode === "invisible" ? (
                        <Image src="/mascot-invisible.png" alt="Invisible mascot" width={68} height={68} className="h-full w-full object-cover" />
                    ) : (
                        <Image src="/mascot-social.png" alt="Social mascot" width={68} height={68} className="h-full w-full object-cover" />
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
                            className="relative rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 shadow-[3px_3px_0_var(--border-strong)] max-w-[280px]"
                        >
                            {/* Triangle pointer */}
                            <div className="absolute left-[-8px] bottom-4 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-[var(--border-strong)]" />
                            <div className="absolute left-[-5px] bottom-4 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[7px] border-r-[var(--surface)]" />
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                <span className="font-bold text-[var(--text-primary)]">🤖</span> {mascotMsg}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Expanded chat */}
                <AnimatePresence>
                    {showMascotChat && (
                        <MascotChat
                            onClose={() => setShowMascotChat(false)}
                            messages={messages}
                            isStreaming={isStreaming}
                            sendMessage={sendMessage}
                            stopStreaming={stopStreaming}
                            clearMessages={clearMessages}
                            onConfirmAction={(actionId) => { confirmAction(actionId); }}
                            onDenyAction={(actionId) => denyAction(actionId)}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Meeting Detail Drawer */}
            <AnimatePresence>
                {selectedMeeting && (
                    <MeetingDetail key={selectedMeeting.id} meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Inline Mascot Chat (Real AI via useAIChat) ─── */
interface MascotChatProps {
    onClose: () => void;
    messages: ChatMessage[];
    isStreaming: boolean;
    sendMessage: (content: string) => void;
    stopStreaming: () => void;
    clearMessages: () => void;
    onConfirmAction?: (actionId: string, actionType: string, args: Record<string, unknown>) => void | Promise<void>;
    onDenyAction?: (actionId: string) => void;
}

function MascotChat({ onClose, messages, isStreaming, sendMessage, stopStreaming, clearMessages, onConfirmAction, onDenyAction }: MascotChatProps) {
    const [input, setInput] = useState("");
    const [voiceInterim, setVoiceInterim] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = (text?: string) => {
        const msg = text || input;
        if (!msg.trim() || isStreaming) return;
        sendMessage(msg);
        setInput("");
    };

    const handleVoiceTranscript = (text: string) => {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        setVoiceInterim("");
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] w-[300px] flex flex-col overflow-hidden"
            style={{ maxHeight: 360 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-[var(--border-strong)] px-4 py-2.5 bg-[#FFE600]">
                <span className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>🤖 Yoodle AI</span>
                <div className="flex items-center gap-1.5">
                    {messages.length > 0 && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={clearMessages}
                            className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0A0A0A] bg-white"
                            title="Clear conversation"
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </motion.button>
                    )}
                    <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} onClick={onClose}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0A0A0A] bg-white text-[8px] font-bold">
                        ✕
                    </motion.button>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {/* Static greeting — always shown as first message */}
                <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                        Hey! Need help with anything? I can prep you for meetings, find docs, or start a room.
                    </div>
                </div>
                {messages.map((msg) => (
                    <ChatBubble
                        key={msg.id}
                        id={msg.id}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.timestamp}
                        isStreaming={isStreaming && msg.role === "assistant" && !msg.content}
                        toolCalls={msg.toolCalls}
                        onConfirmAction={onConfirmAction}
                        onDenyAction={onDenyAction}
                    />
                ))}
            </div>

            {/* Suggestions — only show when no messages yet */}
            {messages.length === 0 && (
                <div className="px-3 pb-1 flex gap-1 overflow-x-auto">
                    {["Summarize my day", "Start a room", "What's pending?"].map((s) => (
                        <button key={s} onClick={() => handleSend(s)}
                            className="flex-shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[#FFE600]/10 transition-colors whitespace-nowrap">
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="border-t border-[var(--border)] px-3 py-2">
                <div className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5">
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder={isStreaming ? "Thinking..." : "Ask anything..."}
                        disabled={isStreaming}
                        className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50" />
                    <VoiceInputButton
                        onTranscript={handleVoiceTranscript}
                        onInterim={setVoiceInterim}
                        onRecordingEnd={() => setVoiceInterim("")}
                        className="!p-0.5"
                    />
                    {isStreaming ? (
                        <motion.button whileTap={{ scale: 0.9 }} onClick={stopStreaming}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EF4444] border border-[var(--border-strong)]">
                            <div className="w-[6px] h-[6px] rounded-sm bg-white" />
                        </motion.button>
                    ) : (
                        <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleSend()}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FFE600] border border-[var(--border-strong)]">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="3"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                        </motion.button>
                    )}
                </div>
                {voiceInterim && (
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 italic truncate px-1">
                        🎙️ {voiceInterim}
                    </p>
                )}
            </div>
        </motion.div>
    );
}

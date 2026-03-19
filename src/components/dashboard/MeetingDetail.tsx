"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { MeetingRecord } from "./meetingsData";
import { Loader2, ExternalLink, Download, Play, Pause, Video, Check, FileText } from "lucide-react";

type Tab = "overview" | "mom" | "transcript" | "recording" | "analytics" | "brief";

const TAB_ICONS: Record<Tab, React.ReactNode> = {
    overview: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>,
    mom: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
    transcript: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
    recording: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>,
    analytics: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
    brief: <FileText size={13} className="text-[#3B82F6]" />,
};

const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "mom", label: "MoM" },
    { key: "transcript", label: "Transcript" },
    { key: "recording", label: "Recording" },
    { key: "analytics", label: "Analytics" },
    { key: "brief", label: "Brief" },
];

interface TranscriptSegment {
    speakerName: string;
    speakerId?: string;
    text: string;
    timestamp: number;
    duration?: number;
}

interface RecordingFile {
    fileId: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
    viewUrl?: string;
    downloadUrl?: string;
}

// NOTE: The parent uses `key={meeting.id}` so React remounts this component
// when the meeting changes, naturally resetting all state to initial values.
export default function MeetingDetail({
    meeting,
    onClose,
}: {
    meeting: MeetingRecord;
    onClose: () => void;
}) {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>("overview");
    const [searchQuery, setSearchQuery] = useState("");

    // Real data fetched from APIs
    const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
    const [recordings, setRecordings] = useState<RecordingFile[]>([]);
    const [loadingTranscript, setLoadingTranscript] = useState(true);
    const [loadingRecordings, setLoadingRecordings] = useState(true);

    // MoM state — can be from meeting prop OR freshly generated
    const [momData, setMomData] = useState(meeting.mom || null);
    const [generatingMom, setGeneratingMom] = useState(false);
    const [momError, setMomError] = useState("");

    // Analytics state
    const [analyticsData, setAnalyticsData] = useState<Record<string, unknown> | null>(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);

    // Brief state
    const [briefData, setBriefData] = useState<Record<string, unknown> | null>(null);
    const [loadingBrief, setLoadingBrief] = useState(false);

    // Feedback toasts
    const [toast, setToast] = useState("");
    const toastTimerRef = useRef<NodeJS.Timeout>(undefined);

    useEffect(() => {
        return () => clearTimeout(toastTimerRef.current);
    }, []);

    const showToast = useCallback((msg: string) => {
        clearTimeout(toastTimerRef.current);
        setToast(msg);
        toastTimerRef.current = setTimeout(() => setToast(""), 2500);
    }, []);

    // Fetch transcript and recordings from real APIs
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        async function fetchTranscript() {
            try {
                const res = await fetch(`/api/transcription?meetingId=${meeting.id}`, { credentials: "include", signal });
                if (signal.aborted) return;
                if (res.ok) {
                    const data = await res.json();
                    setTranscriptSegments(data.data?.segments || []);
                } else {
                    console.error("[MeetingDetail] Failed to fetch transcript:", res.status);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.error("[MeetingDetail] Transcript fetch error:", err);
            } finally {
                if (!signal.aborted) setLoadingTranscript(false);
            }
        }

        async function fetchRecordings() {
            try {
                const res = await fetch(`/api/recordings/${meeting.id}`, { credentials: "include", signal });
                if (signal.aborted) return;
                if (res.ok) {
                    const data = await res.json();
                    setRecordings(data.data?.recordings || []);
                } else {
                    console.error("[MeetingDetail] Failed to fetch recordings:", res.status);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.error("[MeetingDetail] Recordings fetch error:", err);
            } finally {
                if (!signal.aborted) setLoadingRecordings(false);
            }
        }

        // Also fetch existing MoM if not in prop
        async function fetchMom() {
            if (meeting.mom) return;
            try {
                const res = await fetch(`/api/meetings/${meeting.id}/mom`, { credentials: "include", signal });
                if (signal.aborted) return;
                if (res.ok) {
                    const data = await res.json();
                    if (data.data?.mom) setMomData(data.data.mom);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.error("[MeetingDetail] MoM fetch error:", err);
            }
        }

        async function fetchAnalytics() {
            setLoadingAnalytics(true);
            try {
                const res = await fetch(`/api/meetings/${meeting.id}/analytics`, { credentials: "include", signal });
                if (signal.aborted) return;
                if (res.ok) {
                    const data = await res.json();
                    if (data.data) setAnalyticsData(data.data);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.error("[MeetingDetail] Analytics fetch error:", err);
            } finally {
                if (!signal.aborted) setLoadingAnalytics(false);
            }
        }

        async function fetchBrief() {
            setLoadingBrief(true);
            try {
                const res = await fetch(`/api/meetings/${meeting.id}/brief`, { credentials: "include", signal });
                if (signal.aborted) return;
                if (res.ok) {
                    const data = await res.json();
                    if (data.data) setBriefData(data.data);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.error("[MeetingDetail] Brief fetch error:", err);
            } finally {
                if (!signal.aborted) setLoadingBrief(false);
            }
        }

        fetchTranscript();
        fetchRecordings();
        fetchMom();
        fetchAnalytics();
        fetchBrief();

        return () => { controller.abort(); };
    }, [meeting.id, meeting.mom]);

    const hasRealTranscript = transcriptSegments.length > 0;
    const hasRealRecordings = recordings.length > 0;

    // ── Quick Action Handlers ─────────────────────────────────────────

    const handleCopyLink = useCallback(async () => {
        const url = `${window.location.origin}/meetings/${meeting.id}/recording`;
        try {
            await navigator.clipboard.writeText(url);
            showToast("Link copied!");
        } catch {
            showToast("Failed to copy link");
        }
    }, [meeting.id, showToast]);

    const handleShare = useCallback(async () => {
        const url = `${window.location.origin}/meetings/${meeting.id}/recording`;
        const shareData = { title: meeting.title, text: `Check out the meeting: ${meeting.title}`, url };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch { /* cancelled */ }
        } else {
            try {
                await navigator.clipboard.writeText(url);
                showToast("Share link copied!");
            } catch {
                showToast("Failed to copy link");
            }
        }
    }, [meeting.id, meeting.title, showToast]);

    const handleCreateMom = useCallback(async () => {
        if (generatingMom) return;
        setGeneratingMom(true);
        setMomError("");
        try {
            const res = await fetch(`/api/meetings/${meeting.id}/mom`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) {
                setMomError(`Server error (${res.status}). Please try again.`);
                return;
            }
            const data = await res.json();
            if (data.success && data.data?.mom) {
                setMomData(data.data.mom);
                setTab("mom");
                showToast("MoM generated!");
            } else {
                setMomError(data.error?.message || "Failed to generate MoM.");
            }
        } catch {
            setMomError("Something went wrong. Please try again.");
        } finally {
            setGeneratingMom(false);
        }
    }, [meeting.id, generatingMom, showToast]);

    const handleCopySummary = useCallback(async () => {
        const parts: string[] = [`Meeting: ${meeting.title}`, `Date: ${meeting.date} ${meeting.time}`, `Duration: ${meeting.duration}`];
        if (meeting.overview) {
            parts.push("", `Purpose: ${meeting.overview.purpose}`, `Outcome: ${meeting.overview.outcome}`);
        }
        if (momData) {
            if (momData.keyDecisions?.length) parts.push("", "Key Decisions:", ...momData.keyDecisions.map((d) => `  • ${d}`));
            if (momData.actionItems?.length) parts.push("", "Action Items:", ...momData.actionItems.map((a) => `  • ${a.task} (${a.assignee}, ${a.dueDate})`));
        }
        try {
            await navigator.clipboard.writeText(parts.join("\n"));
            showToast("Summary copied!");
        } catch {
            showToast("Failed to copy summary");
        }
    }, [meeting, momData, showToast]);

    const handleDownloadTranscript = useCallback(() => {
        if (transcriptSegments.length === 0) return;
        const formatTs = (ts: number) => { const s = Math.floor(ts / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; };
        const lines = transcriptSegments.map((seg) => `[${formatTs(seg.timestamp)}] ${seg.speakerName}: ${seg.text}`);
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const d = new Date();
        const safeName = meeting.title.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}_${d.toISOString().slice(0, 10)}_${d.toTimeString().slice(0, 5).replace(":", "-")}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Transcript downloaded!");
    }, [transcriptSegments, meeting.title, showToast]);

    const handleOpenRecording = useCallback(() => {
        setTab("recording");
    }, []);

    const handleShareNotes = useCallback(async () => {
        const parts: string[] = [
            `📝 Meeting Notes: ${meeting.title}`,
            `📅 ${meeting.date} · ${meeting.time} · ${meeting.duration}`,
            `👥 Participants: ${meeting.avatars.map((a) => a.name).join(", ")}`,
        ];
        if (meeting.overview) {
            parts.push("", `Purpose: ${meeting.overview.purpose}`, `Outcome: ${meeting.overview.outcome}`);
        }
        if (momData) {
            if (momData.keyDecisions?.length) parts.push("", "🎯 Key Decisions:", ...momData.keyDecisions.map((d) => `  • ${d}`));
            if (momData.discussionPoints?.length) parts.push("", "💬 Discussion Points:", ...momData.discussionPoints.map((d) => `  • ${d}`));
            if (momData.actionItems?.length) parts.push("", "✅ Action Items:", ...momData.actionItems.map((a) => `  • ${a.task} → ${a.assignee} (${a.dueDate})`));
            if (momData.nextSteps?.length) parts.push("", "➡️ Next Steps:", ...momData.nextSteps.map((s) => `  • ${s}`));
        }
        if (hasRealTranscript) {
            parts.push("", `📄 Full transcript available at: ${window.location.origin}/meetings/${meeting.id}/recording`);
        }
        try {
            await navigator.clipboard.writeText(parts.join("\n"));
            showToast("Notes copied to clipboard!");
        } catch {
            showToast("Failed to copy notes");
        }
    }, [meeting, momData, hasRealTranscript, showToast]);

    const handleCreateFollowUp = useCallback(() => {
        const followUpTitle = `Follow-up: ${meeting.title}`;
        router.push(`/meetings/new?title=${encodeURIComponent(followUpTitle)}`);
        onClose();
    }, [meeting.title, router, onClose]);

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
                            <button onClick={handleCopyLink} className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[#FFE600]/20 hover:border-[var(--border-strong)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                                Copy link
                            </button>
                            <button onClick={handleShare} className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[#FFE600]/20 hover:border-[var(--border-strong)] transition-colors" style={{ fontFamily: "var(--font-heading)" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                                Share
                            </button>
                        </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex items-center gap-2 mt-3">
                        {momData && <span className="text-[9px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-full px-2 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>✓ MoM</span>}
                        {(hasRealTranscript || meeting.hasTranscript) && <span className="text-[9px] font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-2 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>✓ Transcript</span>}
                        {(hasRealRecordings || meeting.hasRecording) && <span className="text-[9px] font-bold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-full px-2 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>● Recording</span>}
                    </div>
                </div>

                {/* ── TABS ── */}
                <div className="flex-shrink-0 bg-[var(--surface)] border-b-2 border-[var(--border)] px-8">
                    <div className="flex items-center gap-1">
                        {TABS.map((t) => {
                            const disabled = (t.key === "transcript" && !hasRealTranscript && !meeting.hasTranscript) ||
                                (t.key === "recording" && !hasRealRecordings && !meeting.hasRecording) ||
                                (t.key === "mom" && !momData) ||
                                (t.key === "analytics" && !analyticsData) ||
                                (t.key === "brief" && !briefData);
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
                                    {t.key === "mom" && generatingMom && (
                                        <Loader2 size={10} className="animate-spin ml-1" />
                                    )}
                                    {t.key === "transcript" && loadingTranscript && (
                                        <Loader2 size={10} className="animate-spin ml-1" />
                                    )}
                                    {t.key === "recording" && loadingRecordings && (
                                        <Loader2 size={10} className="animate-spin ml-1" />
                                    )}
                                    {t.key === "analytics" && loadingAnalytics && (
                                        <Loader2 size={10} className="animate-spin ml-1" />
                                    )}
                                    {t.key === "brief" && loadingBrief && (
                                        <Loader2 size={10} className="animate-spin ml-1" />
                                    )}
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
                            {tab === "overview" && <OverviewTab key="overview" meeting={meeting} momData={momData} />}
                            {tab === "mom" && momData && <MoMTab key="mom" mom={momData} />}
                            {tab === "transcript" && (
                                <RealTranscriptTab
                                    key="transcript"
                                    segments={transcriptSegments}
                                    loading={loadingTranscript}
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    meetingTitle={meeting.title}
                                    meetingDate={meeting.date}
                                />
                            )}
                            {tab === "recording" && (
                                <RealRecordingTab
                                    key="recording"
                                    recordings={recordings}
                                    loading={loadingRecordings}
                                    duration={meeting.duration}
                                />
                            )}
                            {tab === "analytics" && analyticsData && <AnalyticsTab key="analytics" data={analyticsData} />}
                            {tab === "brief" && briefData && <BriefTab key="brief" data={briefData} />}
                        </AnimatePresence>
                    </div>

                    {/* Action sidebar */}
                    <div className="w-[220px] flex-shrink-0 border-l-2 border-[var(--border)] bg-[var(--surface)] p-5 overflow-y-auto">
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                            Quick actions
                        </p>
                        <div className="space-y-1.5">
                            {[
                                { label: momData ? "View MoM" : generatingMom ? "Generating…" : "Create MoM", icon: generatingMom ? <Loader2 size={14} className="animate-spin text-[#F59E0B]" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>, available: hasRealTranscript || !!momData, onClick: momData ? () => setTab("mom") : handleCreateMom },
                                { label: "Copy summary", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>, available: true, onClick: handleCopySummary },
                                { label: "Download transcript", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>, available: hasRealTranscript, onClick: handleDownloadTranscript },
                                { label: "Open recording", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>, available: hasRealRecordings, onClick: handleOpenRecording },
                                { label: "Share notes", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>, available: true, onClick: handleShareNotes },
                                { label: "Create follow-up", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, available: true, onClick: handleCreateFollowUp },
                            ].map((action) => (
                                <motion.button
                                    key={action.label}
                                    whileHover={action.available ? { x: 2 } : {}}
                                    onClick={() => action.available && action.onClick?.()}
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

                        {/* MoM generation error */}
                        {momError && (
                            <p className="text-[10px] text-red-500 mt-2 px-3">{momError}</p>
                        )}

                        {/* Action items from meeting */}
                        {momData?.actionItems && momData.actionItems.length > 0 && (
                            <div className="mt-6">
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                                    Action items
                                </p>
                                <div className="space-y-2">
                                    {momData.actionItems.map((item, i) => (
                                        <div key={i} className="rounded-lg border-[1.5px] border-[var(--border)] p-2.5">
                                            <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-snug mb-1">{item.task}</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-[var(--text-muted)] font-medium">{item.assignee}</span>
                                                <span className="text-[9px] text-[#F59E0B] font-bold">{item.dueDate}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Toast notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 shadow-lg"
                    >
                        <Check className="h-3.5 w-3.5 text-[#22C55E]" />
                        <span className="text-xs font-medium text-[var(--text-secondary)]">{toast}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/* ═══ TAB COMPONENTS ═══ */

function OverviewTab({ meeting, momData }: { meeting: MeetingRecord; momData?: { summary?: string; keyDecisions?: string[]; discussionPoints?: string[]; actionItems?: { task: string; assignee: string; dueDate: string }[]; nextSteps?: string[] } | null }) {
    const actionItemCount = momData?.actionItems?.length || meeting.mom?.actionItems?.length || 0;
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
                            { label: "Action items", value: `${actionItemCount}`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
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

            {/* Meeting Artifacts — links to Google Docs, Folder, Slides */}
            {meeting.status === "ended" && meeting.artifacts && (meeting.artifacts.momDocUrl || meeting.artifacts.folderUrl || meeting.artifacts.presentationUrl) && (
                <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5 mt-5">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}>
                        <ExternalLink size={12} className="text-[#FFE600]" /> Meeting Artifacts
                    </p>
                    <div className="space-y-2">
                        {meeting.artifacts.momDocUrl && (
                            <a
                                href={meeting.artifacts.momDocUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                <span className="group-hover:underline">Minutes of Meeting (Google Doc)</span>
                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                        )}
                        {meeting.artifacts.presentationUrl && (
                            <a
                                href={meeting.artifacts.presentationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBC04" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                                <span className="group-hover:underline">Presentation (Google Slides)</span>
                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                        )}
                        {meeting.artifacts.folderUrl && (
                            <a
                                href={meeting.artifacts.folderUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                                <span className="group-hover:underline">Meeting Folder (Google Drive)</span>
                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                        )}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

function MoMTab({ mom }: { mom: { summary?: string; keyDecisions: string[]; discussionPoints: string[]; actionItems: { task: string; assignee: string; dueDate: string }[]; nextSteps: string[] } }) {
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
                                <span className="text-[10px] font-medium text-[var(--text-secondary)]">{item.assignee}</span>
                                <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 rounded-full px-2 py-0.5">{item.dueDate}</span>
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

/** Real transcript tab that fetches from /api/transcription */
function RealTranscriptTab({
    segments,
    loading,
    searchQuery,
    setSearchQuery,
    meetingTitle,
    meetingDate,
}: {
    segments: TranscriptSegment[];
    loading: boolean;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    meetingTitle?: string;
    meetingDate?: string;
}) {
    const formatTimestamp = (ts: number) => {
        const totalSeconds = Math.floor(ts / 1000);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const handleDownload = () => {
        if (segments.length === 0) return;
        const lines = segments.map(
            (seg) => `[${formatTimestamp(seg.timestamp)}] ${seg.speakerName}: ${seg.text}`
        );
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const d = meetingDate ? new Date(meetingDate) : new Date();
        const datePart = d.toISOString().slice(0, 10);
        const timePart = d.toTimeString().slice(0, 5).replace(":", "-");
        const safeName = meetingTitle
            ? meetingTitle.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_")
            : "Transcript";
        a.download = `${safeName}_${datePart}_${timePart}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filtered = searchQuery
        ? segments.filter((e) => e.text.toLowerCase().includes(searchQuery.toLowerCase()) || e.speakerName.toLowerCase().includes(searchQuery.toLowerCase()))
        : segments;

    if (loading) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[var(--text-muted)] mb-3" />
                <p className="text-xs text-[var(--text-muted)]">Loading transcript…</p>
            </motion.div>
        );
    }

    if (segments.length === 0) {
        return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-[var(--text-muted)] mb-3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                <p className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                    No transcript available for this meeting.
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1" style={{ fontFamily: "var(--font-body)" }}>
                    Enable captions during a meeting to generate a transcript.
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Search + Download */}
            <div className="mb-4 flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
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
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 rounded-xl border-[1.5px] border-[var(--border)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    <Download size={12} />
                    .txt
                </button>
            </div>

            {/* Transcript entries */}
            <div className="space-y-1">
                {filtered.map((entry, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.02, 0.5) }}
                        className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--surface)] transition-colors group"
                    >
                        <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)] font-mono pt-0.5 w-10">{formatTimestamp(entry.timestamp)}</span>
                        <div className="flex-1">
                            <span className="text-[11px] font-bold text-[var(--text-secondary)] mr-2" style={{ fontFamily: "var(--font-heading)" }}>{entry.speakerName}</span>
                            <span className="text-sm text-[var(--text-secondary)] leading-relaxed">{entry.text}</span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/** Real recording tab that fetches from /api/recordings */
function RealRecordingTab({
    recordings,
    loading,
    duration,
}: {
    recordings: RecordingFile[];
    loading: boolean;
    duration: string;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const formatFileSize = (sizeStr?: string) => {
        if (!sizeStr) return "";
        const bytes = parseInt(sizeStr, 10);
        if (isNaN(bytes)) return "";
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handlePlayPause = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    if (loading) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[var(--text-muted)] mb-3" />
                <p className="text-xs text-[var(--text-muted)]">Loading recordings…</p>
            </motion.div>
        );
    }

    const latestRecording = recordings.length > 0 ? recordings[0] : null;

    if (!latestRecording) {
        return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
                <Video size={32} className="mx-auto text-[var(--text-muted)] mb-3" />
                <p className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                    No recording available for this meeting.
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1" style={{ fontFamily: "var(--font-body)" }}>
                    Start recording during a meeting to save it here.
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Video player */}
            <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--foreground)] overflow-hidden relative" style={{ aspectRatio: "16/9" }}>
                {latestRecording.downloadUrl ? (
                    <video
                        ref={videoRef}
                        src={latestRecording.downloadUrl}
                        className="w-full h-full object-contain"
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        controls
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                        <Video size={28} className="text-white/30 mb-2" />
                        <span className="text-sm text-white/50 mb-3" style={{ fontFamily: "var(--font-body)" }}>
                            Recording stored in Google Drive
                        </span>
                        {latestRecording.viewUrl && (
                            <a
                                href={latestRecording.viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-bold text-[#FFE600] hover:underline"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                <ExternalLink size={12} />
                                Open in Google Drive
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-3">
                    {latestRecording.downloadUrl && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handlePlayPause}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--foreground)] text-white"
                        >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </motion.button>
                    )}
                    <span className="text-xs text-[var(--text-muted)]">{duration}</span>
                </div>
                <div className="flex items-center gap-3">
                    {latestRecording.viewUrl && (
                        <a
                            href={latestRecording.viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <ExternalLink size={12} />
                            View in Drive
                        </a>
                    )}
                    {latestRecording.downloadUrl && (
                        <a
                            href={latestRecording.downloadUrl}
                            download
                            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            <Download size={12} />
                            Download {formatFileSize(latestRecording.size) && `(${formatFileSize(latestRecording.size)})`}
                        </a>
                    )}
                </div>
            </div>

            {/* All recordings list */}
            {recordings.length > 1 && (
                <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                        All recordings ({recordings.length})
                    </p>
                    <div className="space-y-2">
                        {recordings.map((rec) => (
                            <a
                                key={rec.fileId}
                                href={rec.viewUrl || rec.downloadUrl || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-[var(--background)] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Video size={14} className="text-[var(--text-muted)]" />
                                    <span className="text-xs text-[var(--text-secondary)]">{rec.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {rec.createdTime && (
                                        <span className="text-[10px] text-[var(--text-muted)]">
                                            {new Date(rec.createdTime).toLocaleDateString()}
                                        </span>
                                    )}
                                    {formatFileSize(rec.size) && (
                                        <span className="text-[10px] text-[var(--text-muted)]">{formatFileSize(rec.size)}</span>
                                    )}
                                    <ExternalLink size={10} className="text-[var(--text-muted)]" />
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

function AnalyticsTab({ data }: { data: Record<string, unknown> }) {
    const score = (data.meetingScore as number) || 0;
    const breakdown = (data.scoreBreakdown as Record<string, number>) || {};
    const speakers = (data.speakerStats as { name: string; talkTimePercent: number; wordCount: number }[]) || [];
    const highlights = (data.highlights as { timestamp: number; type: string; text: string }[]) || [];
    const decisions = (data.decisionCount as number) || 0;
    const actionItems = (data.actionItemCount as number) || 0;
    const completed = (data.actionItemsCompleted as number) || 0;
    const scoreColor = score >= 70 ? "#22C55E" : score >= 40 ? "#F59E0B" : "#EF4444";

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            {/* Score ring */}
            <div className="flex items-center gap-6">
                <div className="relative h-20 w-20 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke={scoreColor} strokeWidth="3" strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-black">{score}</span>
                </div>
                <div className="flex-1 space-y-2">
                    {Object.entries(breakdown).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-secondary)] w-32 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                            <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                                <div className="h-full bg-[#FFE600] rounded-full" style={{ width: `${val}%` }} />
                            </div>
                            <span className="text-xs font-medium w-8 text-right">{val}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
                {[{ label: "Decisions", value: decisions }, { label: "Action Items", value: actionItems }, { label: "Completed", value: completed }].map((s) => (
                    <div key={s.label} className="rounded-xl border-2 border-[var(--border)] p-3 text-center">
                        <div className="text-2xl font-black">{s.value}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Speaker stats */}
            {speakers.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold mb-2">Speaker Breakdown</h4>
                    <div className="space-y-2">
                        {speakers.sort((a, b) => b.talkTimePercent - a.talkTimePercent).map((s) => (
                            <div key={s.name} className="flex items-center gap-2">
                                <span className="text-xs w-24 truncate">{s.name}</span>
                                <div className="flex-1 h-3 bg-[var(--border)] rounded-full overflow-hidden">
                                    <div className="h-full bg-[#06B6D4] rounded-full" style={{ width: `${s.talkTimePercent}%` }} />
                                </div>
                                <span className="text-xs font-medium w-12 text-right">{s.talkTimePercent}%</span>
                                <span className="text-[10px] text-[var(--text-secondary)] w-16 text-right">{s.wordCount} words</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold mb-2">Key Moments</h4>
                    <div className="space-y-2">
                        {highlights.map((h, i) => {
                            const badgeColor = { decision: "#22C55E", disagreement: "#EF4444", commitment: "#3B82F6", key_point: "#F59E0B" }[h.type] || "#6B7280";
                            return (
                                <div key={i} className="flex gap-2 text-sm">
                                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white flex-shrink-0" style={{ backgroundColor: badgeColor }}>{h.type.replace("_", " ")}</span>
                                    <span className="text-[var(--text-primary)]">{h.text}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </motion.div>
    );
}

function BriefTab({ data }: { data: Record<string, unknown> }) {
    const agendaSuggestions = (data.agendaSuggestions as string[]) || [];
    const carryoverItems = (data.carryoverItems as { task: string; fromMeetingTitle: string }[]) || [];
    const sources = (data.sources as { type: string; title: string; summary: string }[]) || [];
    const googleDocUrl = data.googleDocUrl as string | undefined;
    const status = data.status as string | undefined;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
            {/* Status badge */}
            {status === "stale" && (
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">
                        Stale — brief may be outdated
                    </span>
                </div>
            )}

            {/* Suggested Agenda */}
            {agendaSuggestions.length > 0 && (
                <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
                        Suggested Agenda
                    </p>
                    <ul className="space-y-2">
                        {agendaSuggestions.map((item, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                                <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Carryover Items */}
            {carryoverItems.length > 0 && (
                <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></svg>
                        Carryover Items
                    </p>
                    <ul className="space-y-2">
                        {carryoverItems.map((item, i) => (
                            <li key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                <span className="text-[var(--text-muted)] mr-1">{"\u21B3"}</span>
                                {item.task}
                                <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">from {item.fromMeetingTitle}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Relevant Sources */}
            {sources.length > 0 && (
                <div className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-5">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                        Relevant Sources
                    </p>
                    <div className="space-y-2">
                        {sources.map((src, i) => (
                            <div key={i} className="rounded-xl bg-[var(--background)] px-3.5 py-2.5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 px-2 py-0.5 text-[9px] font-bold text-[#8B5CF6] uppercase">
                                        {src.type}
                                    </span>
                                    <span className="text-xs font-medium text-[var(--text-primary)]">{src.title}</span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{src.summary}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Google Doc link */}
            {googleDocUrl && (
                <a
                    href={googleDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3B82F6] hover:underline"
                >
                    <ExternalLink size={14} />
                    View full brief in Google Docs
                </a>
            )}
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

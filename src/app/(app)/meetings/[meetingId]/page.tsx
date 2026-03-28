"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, ChevronDown, Loader2, ExternalLink, PlayCircle, ClipboardList, BarChart3, CalendarCheck, CheckCircle2, ListTodo, UserPlus, Send, Check, X } from "lucide-react";
import PreJoinLobby from "@/components/meeting/PreJoinLobby";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";
import { saveRoomJoinSession, type RoomJoinSession } from "@/lib/meetings/room-session";

interface MeetingSettings {
  allowRecording?: boolean;
  allowScreenShare?: boolean;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
  maxParticipants?: number;
}

interface MeetingMom {
  summary?: string;
  keyDecisions?: string[];
  actionItems?: { task: string; assignee: string; dueDate?: string }[];
  nextSteps?: string[];
}

interface MeetingData {
  _id: string;
  title: string;
  code: string;
  status: string;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  recordingId?: string;
  participants: { userId: string; status: string }[];
  settings?: MeetingSettings;
  mom?: MeetingMom;
  artifacts?: {
    momDocUrl?: string;
    presentationUrl?: string;
    folderUrl?: string;
  };
}

export default function MeetingLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;
  const { user } = useAuth();

  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [waitingForAdmission, setWaitingForAdmission] = useState(false);
  const [pendingJoinSettings, setPendingJoinSettings] = useState<{
    video: boolean;
    audio: boolean;
    videoDeviceId?: string;
    audioDeviceId?: string;
  } | null>(null);
  const pollingRef = useRef(false);
  const admittedRef = useRef(false);

  useEffect(() => {
    fetch(`/api/meetings/${meetingId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.success && data.data) {
          setMeeting(data.data);
        } else {
          setError(data.error?.message || "Meeting not found");
        }
      })
      .catch(() => setError("Failed to load meeting"))
      .finally(() => setLoading(false));
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId || !user) return;
    const controller = new AbortController();
    setLoadingBrief(true);
    fetch(`/api/meetings/${meetingId}/brief`, { credentials: "include", signal: controller.signal })
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((res) => { if (res?.data) setBrief(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[MeetingLobbyPage] Failed to fetch brief:", err);
      })
      .finally(() => setLoadingBrief(false));
    return () => controller.abort();
  }, [meetingId, user]);

  const submitJoin = useCallback(
    async (settings: {
      video: boolean;
      audio: boolean;
      videoDeviceId?: string;
      audioDeviceId?: string;
    }) => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            videoEnabled: settings.video,
            audioEnabled: settings.audio,
            videoDeviceId: settings.videoDeviceId,
            audioDeviceId: settings.audioDeviceId,
          }),
        });

        const data = await res.json();
        if (data.success) {
          const roomSession = data.data?.roomSession as
            | RoomJoinSession
            | undefined;
          if (!roomSession) {
            throw new Error("Missing room session data.");
          }

          saveRoomJoinSession(meetingId, roomSession);

          if (roomSession.joinDisposition === "waiting" && !admittedRef.current) {
            setPendingJoinSettings(settings);
            setWaitingForAdmission(true);
            setError("");
            return;
          }

          // Reset admitted flag after use to avoid permanently skipping waiting room
          admittedRef.current = false;
          router.push(`/meetings/${roomSession.roomId}/room`);
        } else {
          setError(data.error?.message || "Failed to join meeting");
        }
      } catch {
        setError("Failed to join meeting");
      }
    },
    [meetingId, router],
  );

  // ── HTTP polling for waiting room admission ──────────────────────

  useEffect(() => {
    if (!waitingForAdmission || !pendingJoinSettings || !meeting || !user) {
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = true;

    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/meetings/${meetingId}/waiting-status?mode=check`,
          { credentials: "include" },
        );
        if (!res.ok || !active) return;
        const json = await res.json();
        const status = json.data?.status ?? json.status;

        if (status === "admitted") {
          pollingRef.current = false;
          setWaitingForAdmission(false);
          admittedRef.current = true;
          await submitJoin(pendingJoinSettings);
          return;
        }

        if (status === "denied") {
          pollingRef.current = false;
          setWaitingForAdmission(false);
          setPendingJoinSettings(null);
          setError("The host denied your request to join this meeting.");
          return;
        }
      } catch {
        // Polling is best-effort
      }
    };

    const interval = setInterval(poll, 3000);

    return () => {
      active = false;
      pollingRef.current = false;
      clearInterval(interval);
    };
  }, [waitingForAdmission, pendingJoinSettings, meeting, user, meetingId, submitJoin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-6xl">😵</div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] font-heading">
          {error || "Meeting not found"}
        </h2>
        <button
          onClick={() => router.push("/meetings")}
          className="text-sm text-[var(--text-secondary)] underline cursor-pointer font-body"
        >
          Back to meetings
        </button>
      </motion.div>
    );
  }

  if (waitingForAdmission) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
      >
        <div className="h-12 w-12 rounded-full border-4 border-[#FFE600] border-t-transparent animate-spin" />
        <h2
          className="text-2xl font-black text-[var(--text-primary)] font-heading"
        >
          Waiting for host approval
        </h2>
        <p
          className="max-w-md text-sm text-[var(--text-secondary)] font-body"
        >
          Your request has been sent to the host. Keep this page open and you
          will be let in automatically when they admit you.
        </p>
      </motion.div>
    );
  }

  return (
    <div>
      {/* Post-Meeting Summary */}
      {meeting.status === "ended" && (
        <div className="space-y-4 mb-4">
          {/* Quick links row */}
          <div className="flex flex-wrap gap-2">
            {meeting.recordingId && (
              <a
                href={`/meetings/${meetingId}/recording`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border-2 border-[var(--border-strong)] text-xs font-bold text-[var(--text-primary)] hover:border-[#FF6B6B] transition-colors shadow-[2px_2px_0_var(--border-strong)] font-heading"
              >
                <PlayCircle size={14} className="text-[#FF6B6B]" />
                Recording & Transcript
              </a>
            )}
            {meeting.artifacts?.momDocUrl && (
              <a
                href={meeting.artifacts.momDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border-2 border-[var(--border-strong)] text-xs font-bold text-[var(--text-primary)] hover:border-[#FFE600] transition-colors shadow-[2px_2px_0_var(--border-strong)] font-heading"
              >
                <ExternalLink size={14} />
                Meeting Notes Doc
              </a>
            )}
            {meeting.artifacts?.folderUrl && (
              <a
                href={meeting.artifacts.folderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border-2 border-[var(--border-strong)] text-xs font-bold text-[var(--text-primary)] hover:border-[#FFE600] transition-colors shadow-[2px_2px_0_var(--border-strong)] font-heading"
              >
                <ExternalLink size={14} />
                Drive Folder
              </a>
            )}
          </div>

          {/* Minutes of Meeting */}
          {meeting.mom?.summary && (
            <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-[#8B5CF6]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)] font-heading">
                  Minutes of Meeting
                </h3>
              </div>

              {/* Summary */}
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-body">
                {meeting.mom.summary}
              </p>

              {/* Key Decisions */}
              {meeting.mom.keyDecisions && meeting.mom.keyDecisions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 font-heading">
                    Key Decisions
                  </p>
                  <ul className="space-y-1.5">
                    {meeting.mom.keyDecisions.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed font-body">
                        <CheckCircle2 size={14} className="text-[#10B981] flex-shrink-0 mt-0.5" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {meeting.mom.actionItems && meeting.mom.actionItems.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 font-heading">
                    Action Items
                  </p>
                  <ul className="space-y-1.5">
                    {meeting.mom.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed font-body">
                        <ListTodo size={14} className="text-[#3B82F6] flex-shrink-0 mt-0.5" />
                        <span>
                          {item.task}
                          {item.assignee && item.assignee !== "Unassigned" && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#3B82F6]/10 text-[#3B82F6] font-medium">
                              {item.assignee}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Steps */}
              {meeting.mom.nextSteps && meeting.mom.nextSteps.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 font-heading">
                    Next Steps
                  </p>
                  <ul className="space-y-1.5">
                    {meeting.mom.nextSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed font-body">
                        <CalendarCheck size={14} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Meeting Stats */}
          {meeting.startedAt && meeting.endedAt && (
            <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-[#06B6D4]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)] font-heading">
                  Meeting Stats
                </h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text-muted)] font-body">
                  Duration: {Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000)} min
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text-muted)] font-body">
                  Participants: {meeting.participants.length}
                </span>
                {meeting.recordingId && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6B6B]/30 bg-[#FF6B6B]/5 px-3 py-1.5 text-xs text-[#FF6B6B] font-body">
                    Recorded
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite Attendees Section */}
      {meeting.status !== "ended" && meeting.status !== "cancelled" && (
        <InviteSection meetingId={meetingId} meetingCode={meeting.code} meetingTitle={meeting.title} />
      )}

      <PreJoinLobby
        meetingId={meetingId}
        meetingTitle={meeting.title}
        meetingCode={meeting.code}
        participantCount={(meeting.participants || []).filter((p) => p.status === "joined").length}
        settings={meeting.settings}
        scheduledAt={meeting.scheduledAt}
        onJoin={submitJoin}
      />

      {(brief || loadingBrief) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] mt-4 overflow-hidden"
        >
          {/* Collapsible header */}
          <button
            onClick={() => setBriefCollapsed((c) => !c)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#3B82F6]" />
              <span
                className="text-sm font-bold text-[var(--text-primary)] font-heading"
              >
                Meeting Brief
              </span>
              {brief?.status === "stale" && (
                <span className="rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-2 py-0.5 text-[9px] font-bold text-[#F59E0B]">
                  Stale
                </span>
              )}
            </div>
            <ChevronDown
              size={16}
              className={`text-[var(--text-muted)] transition-transform ${briefCollapsed ? "" : "rotate-180"}`}
            />
          </button>

          {/* Content */}
          {!briefCollapsed && (
            <div className="border-t border-[var(--border)] px-5 pb-5 pt-4 space-y-4">
              {loadingBrief && !brief && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
                </div>
              )}

              {brief && (
                <>
                  {/* Suggested Agenda */}
                  {Array.isArray(brief.agendaSuggestions) && (brief.agendaSuggestions as string[]).length > 0 && (
                    <div>
                      <p
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 font-heading"
                      >
                        Suggested Agenda
                      </p>
                      <ul className="space-y-1.5">
                        {(brief.agendaSuggestions as string[]).map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                            <span className="flex-shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Carryover Items */}
                  {Array.isArray(brief.carryoverItems) && (brief.carryoverItems as { task: string; fromMeetingTitle: string }[]).length > 0 && (
                    <div>
                      <p
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 font-heading"
                      >
                        Carryover Items
                      </p>
                      <ul className="space-y-1.5">
                        {(brief.carryoverItems as { task: string; fromMeetingTitle: string }[]).map((item, i) => (
                          <li key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            <span className="text-[var(--text-muted)] mr-1">{"\u21B3"}</span>
                            {item.task}
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">from {item.fromMeetingTitle}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Relevant Sources */}
                  {Array.isArray(brief.sources) && (brief.sources as { type: string; title: string; summary: string }[]).length > 0 && (
                    <div>
                      <p
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 font-heading"
                      >
                        Relevant Sources
                      </p>
                      <div className="space-y-2">
                        {(brief.sources as { type: string; title: string; summary: string }[]).map((src, i) => (
                          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
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
                  {brief.googleDocUrl && (
                    <a
                      href={brief.googleDocUrl as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3B82F6] hover:underline"
                    >
                      <ExternalLink size={12} />
                      View full brief in Google Docs
                    </a>
                  )}
                </>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function InviteSection({ meetingId, meetingCode, meetingTitle }: { meetingId: string; meetingCode: string; meetingTitle: string }) {
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [linkCopied, setLinkCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("sent");
        setEmail("");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setErrorMsg(data.error?.message || "Failed to send invite");
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setErrorMsg("Failed to send invite");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const copyLink = async () => {
    const link = `${window.location.origin}/meetings/join?code=${meetingCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden mb-4">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-[#FFE600]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)] font-heading">
              Invite People
            </h3>
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-heading"
          >
            {linkCopied ? <Check size={12} className="text-green-500" /> : <Send size={12} />}
            {linkCopied ? "Copied!" : "Copy Link"}
          </button>
        </div>

        {!showInvite ? (
          <button
            onClick={() => setShowInvite(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--text-muted)] hover:border-[#FFE600] hover:text-[var(--text-primary)] transition-colors font-heading"
          >
            <UserPlus size={16} /> Add attendees by email
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="Enter email address"
                className="flex-1 rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none font-body"
              />
              <button
                onClick={handleInvite}
                disabled={status === "sending" || !email.trim()}
                className="rounded-xl bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40 font-heading"
              >
                {status === "sending" ? <Loader2 size={14} className="animate-spin" /> : status === "sent" ? <Check size={14} /> : "Invite"}
              </button>
            </div>
            {status === "error" && errorMsg && (
              <p className="text-xs text-[#FF6B6B] font-body">{errorMsg}</p>
            )}
            {status === "sent" && (
              <p className="text-xs text-green-500 font-body">Invite sent!</p>
            )}
            <button
              onClick={() => { setShowInvite(false); setEmail(""); setStatus("idle"); setErrorMsg(""); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-heading"
            >
              <X size={10} className="inline mr-1" />Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

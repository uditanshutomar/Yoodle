"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, ChevronDown, Loader2, ExternalLink } from "lucide-react";
import PreJoinLobby from "@/components/meeting/PreJoinLobby";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";
import { saveRoomJoinSession, type RoomJoinSession } from "@/lib/meetings/room-session";

interface MeetingData {
  _id: string;
  title: string;
  code: string;
  status: string;
  participants: { userId: string; status: string }[];
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
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => { if (res?.data) setBrief(res.data); })
      .catch(() => {})
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
        <h2 className="text-xl font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          {error || "Meeting not found"}
        </h2>
        <button
          onClick={() => router.push("/meetings")}
          className="text-sm text-[var(--text-secondary)] underline cursor-pointer"
          style={{ fontFamily: "var(--font-body)" }}
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
          className="text-2xl font-black text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Waiting for host approval
        </h2>
        <p
          className="max-w-md text-sm text-[var(--text-secondary)]"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Your request has been sent to the host. Keep this page open and you
          will be let in automatically when they admit you.
        </p>
      </motion.div>
    );
  }

  return (
    <div>
      {/* Post-Meeting Artifacts */}
      {meeting.status === "ended" && meeting.artifacts && (
        Object.values(meeting.artifacts).some(Boolean) && (
          <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 space-y-3 mb-4">
            <h3
              className="text-sm font-bold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Meeting Artifacts
            </h3>
            <div className="flex flex-wrap gap-2">
              {meeting.artifacts.momDocUrl && (
                <a
                  href={meeting.artifacts.momDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[#FFE600] transition-colors"
                >
                  📄 Meeting Notes
                </a>
              )}
              {meeting.artifacts.presentationUrl && (
                <a
                  href={meeting.artifacts.presentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[#FFE600] transition-colors"
                >
                  📊 Slides
                </a>
              )}
              {meeting.artifacts.folderUrl && (
                <a
                  href={meeting.artifacts.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[#FFE600] transition-colors"
                >
                  📁 Drive Folder
                </a>
              )}
            </div>
          </div>
        )
      )}

      <PreJoinLobby
        meetingId={meetingId}
        meetingTitle={meeting.title}
        meetingCode={meeting.code}
        participantCount={(meeting.participants || []).filter((p) => p.status === "joined").length}
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
                className="text-sm font-bold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
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
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2"
                        style={{ fontFamily: "var(--font-heading)" }}
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
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2"
                        style={{ fontFamily: "var(--font-heading)" }}
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
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2"
                        style={{ fontFamily: "var(--font-heading)" }}
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

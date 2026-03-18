"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
  const [waitingForAdmission, setWaitingForAdmission] = useState(false);
  const [pendingJoinSettings, setPendingJoinSettings] = useState<{
    video: boolean;
    audio: boolean;
    videoDeviceId?: string;
    audioDeviceId?: string;
  } | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    fetch(`/api/meetings/${meetingId}`, { credentials: "include" })
      .then((r) => r.json())
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

          if (roomSession.joinDisposition === "waiting") {
            setPendingJoinSettings(settings);
            setWaitingForAdmission(true);
            setError("");
            return;
          }

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
    </div>
  );
}

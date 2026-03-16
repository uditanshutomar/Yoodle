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
        <h2 className="text-xl font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
          {error || "Meeting not found"}
        </h2>
        <button
          onClick={() => router.push("/meetings")}
          className="text-sm text-[#0A0A0A]/60 underline cursor-pointer"
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
          className="text-2xl font-black text-[#0A0A0A]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Waiting for host approval
        </h2>
        <p
          className="max-w-md text-sm text-[#0A0A0A]/60"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Your request has been sent to the host. Keep this page open and you
          will be let in automatically when they admit you.
        </p>
      </motion.div>
    );
  }

  return (
    <PreJoinLobby
      meetingId={meetingId}
      meetingTitle={meeting.title}
      meetingCode={meeting.code}
      participantCount={meeting.participants.filter((p) => p.status === "joined").length}
      onJoin={submitJoin}
    />
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PreJoinLobby from "@/components/meeting/PreJoinLobby";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { saveRoomJoinSession, type RoomJoinSession } from "@/lib/meetings/room-session";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";

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
  const { socket, isConnected } = useSocket();
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
  const waitingJoinSentRef = useRef(false);

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
            waitingJoinSentRef.current = false;
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

  useEffect(() => {
    if (
      !waitingForAdmission ||
      !pendingJoinSettings ||
      !meeting ||
      !socket ||
      !isConnected ||
      !user ||
      waitingJoinSentRef.current
    ) {
      return;
    }

    waitingJoinSentRef.current = true;

    const roomId = meeting._id;

    const handleAdmitted = async (payload: { roomId: string }) => {
      if (payload.roomId !== roomId) return;
      waitingJoinSentRef.current = false;
      setWaitingForAdmission(false);
      await submitJoin(pendingJoinSettings);
    };

    const handleDenied = (payload: { roomId: string }) => {
      if (payload.roomId !== roomId) return;
      waitingJoinSentRef.current = false;
      setWaitingForAdmission(false);
      setPendingJoinSettings(null);
      setError("The host denied your request to join this meeting.");
    };

    socket.on(SOCKET_EVENTS.WAITING_ADMITTED, handleAdmitted);
    socket.on(SOCKET_EVENTS.WAITING_DENIED, handleDenied);

    socket.emit(SOCKET_EVENTS.WAITING_JOIN, {
      roomId,
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        avatar: user.avatar || undefined,
        joinedWaitingAt: Date.now(),
      },
    });

    return () => {
      socket.off(SOCKET_EVENTS.WAITING_ADMITTED, handleAdmitted);
      socket.off(SOCKET_EVENTS.WAITING_DENIED, handleDenied);
    };
  }, [
    waitingForAdmission,
    pendingJoinSettings,
    meeting,
    socket,
    isConnected,
    user,
    submitJoin,
  ]);

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

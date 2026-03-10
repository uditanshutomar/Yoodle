"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PreJoinLobby from "@/components/meeting/PreJoinLobby";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

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

  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const handleJoin = async (settings: { video: boolean; audio: boolean }) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem("yoodle-lobby-passed", meetingId);
        if (data.data?.transportMode) {
          sessionStorage.setItem("yoodle-transport-mode", data.data.transportMode);
        }
        // Store host ID so room page can enable host controls
        const hostId = data.data?.meeting?.hostId?._id || data.data?.meeting?.hostId;
        if (hostId) {
          sessionStorage.setItem("yoodle-host-id", String(hostId));
        }
        router.push(`/meetings/${meetingId}/room`);
      } else {
        setError(data.error?.message || "Failed to join meeting");
      }
    } catch {
      setError("Failed to join meeting");
    }
  };

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

  return (
    <PreJoinLobby
      meetingId={meetingId}
      meetingTitle={meeting.title}
      meetingCode={meeting.code}
      participantCount={meeting.participants.filter((p) => p.status === "joined").length}
      onJoin={handleJoin}
    />
  );
}

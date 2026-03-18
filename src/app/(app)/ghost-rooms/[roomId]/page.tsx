"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Ghost, ArrowLeft, Video } from "lucide-react";
import GhostRoomBanner from "@/components/ghost/GhostRoomBanner";
import GhostChat from "@/components/ghost/GhostChat";
import GhostShield from "@/components/ghost/GhostShield";
import VoteToSave from "@/components/ghost/VoteToSave";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface GhostMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type: "text" | "system";
}

interface GhostRoomDetail {
  roomId: string;
  title: string;
  code: string;
  hostId: string;
  expiresAt: string;
  messages: GhostMessage[];
  participants: { userId: string; name: string; displayName?: string; votedToSave: boolean }[];
  notes: string;
  meetingId?: string;
}

export default function GhostRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;
  const { user } = useAuth();

  const [room, setRoom] = useState<GhostRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [actionError, setActionError] = useState("");
  const [startingCall, setStartingCall] = useState(false);

  const fetchRoom = useCallback(async () => {
    if (!user || !roomId) return;
    try {
      const res = await fetch(`/api/ghost-rooms/${roomId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data) {
        setRoom(data.data);
        const me = data.data.participants?.find((p: { userId: string }) => p.userId === user?.id);
        if (me?.votedToSave) setHasVoted(true);
      } else {
        const errMsg = typeof data.error === "string"
          ? data.error
          : data.error?.message || data.message || "Room not found or expired.";
        setError(errMsg);
      }
    } catch {
      setError("Failed to load ghost room.");
    } finally {
      setLoading(false);
    }
  }, [user, roomId]);

  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 5000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  const sendMessage = async (content: string) => {
    if (!user || !roomId) return;
    setActionError("");
    try {
      const res = await fetch(`/api/ghost-rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "addMessage", content }),
      });
      if (!res.ok) {
        setActionError("Failed to send message. Try again.");
      }
      fetchRoom();
    } catch {
      setActionError("Failed to send message. Check your connection.");
    }
  };

  const [localNotes, setLocalNotes] = useState("");
  const notesSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesInitializedRef = useRef(false);

  // Sync notes from server on first load or when room changes
  useEffect(() => {
    if (room?.notes !== undefined && !notesInitializedRef.current) {
      setLocalNotes(room.notes);
      notesInitializedRef.current = true;
    }
  }, [room?.notes]);

  const syncNotesToServer = useCallback(
    (notes: string) => {
      if (!user || !roomId) return;
      fetch(`/api/ghost-rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "updateNotes", notes }),
      }).catch(() => {});
    },
    [user, roomId],
  );

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
    // Debounce: sync to server 800ms after user stops typing
    if (notesSyncTimerRef.current) clearTimeout(notesSyncTimerRef.current);
    notesSyncTimerRef.current = setTimeout(() => syncNotesToServer(value), 800);
  };

  const handleVote = async () => {
    if (!user || !roomId) return;
    setActionError("");
    try {
      const res = await fetch(`/api/ghost-rooms/${roomId}/vote-save`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setHasVoted(true);
        fetchRoom();
      } else {
        setActionError(data.error || "Failed to submit vote.");
      }
    } catch {
      setActionError("Failed to vote. Check your connection.");
    }
  };

  const handleStartCall = async () => {
    if (!user || !roomId) return;
    setStartingCall(true);
    setActionError("");
    try {
      const res = await fetch(`/api/ghost-rooms/${roomId}/start-call`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data?.meetingId) {
        router.push(`/meetings/${data.data.meetingId}/room`);
      } else {
        setActionError(data.error || "Failed to start call.");
        setStartingCall(false);
      }
    } catch {
      setActionError("Failed to start call. Check your connection.");
      setStartingCall(false);
    }
  };

  // If ghost room already has an active call, allow joining it
  const handleJoinCall = () => {
    if (room?.meetingId) {
      router.push(`/meetings/${room.meetingId}/room`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#7C3AED] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
        <Ghost size={48} className="text-[#7C3AED] mb-4" />
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
          {error || "Ghost room vanished 👻"}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6" style={{ fontFamily: "var(--font-body)" }}>
          This room has expired or doesn&apos;t exist anymore.
        </p>
        <Link href="/meetings">
          <Button variant="secondary" size="md" icon={ArrowLeft}>
            Back to Ghost Rooms
          </Button>
        </Link>
      </motion.div>
    );
  }

  const totalParticipants = room.participants?.length || 0;
  const totalVotes = room.participants?.filter((p) => p.votedToSave).length || 0;

  return (
    <GhostShield userName={user?.name || "Anonymous"}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 h-full">
        {/* Action error */}
        {actionError && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-2 text-sm text-red-600" style={{ fontFamily: "var(--font-body)" }}>
            {actionError}
          </div>
        )}

        {/* Back link */}
        <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[#7C3AED] transition-colors" style={{ fontFamily: "var(--font-body)" }}>
          <ArrowLeft size={14} /> Back to Ghost Rooms
        </Link>

        {/* Banner */}
        <GhostRoomBanner expiresAt={new Date(room.expiresAt)} title={room.title} />

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: "calc(100vh - 320px)" }}>
          {/* Chat area */}
          <div className="lg:col-span-2 min-h-[400px]">
            <GhostChat messages={room.messages || []} currentUserId={user?.id || ""} onSend={sendMessage} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Start / Join Call */}
            <div className="bg-[var(--surface)] border-2 border-[#7C3AED] rounded-2xl shadow-[4px_4px_0_#7C3AED] p-5">
              {room.meetingId ? (
                <button
                  onClick={handleJoinCall}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#7C3AED] text-white font-bold rounded-xl border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#0A0A0A] transition-all cursor-pointer"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  <Video size={18} />
                  Join Active Call
                </button>
              ) : (
                <button
                  onClick={handleStartCall}
                  disabled={startingCall}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#7C3AED] text-white font-bold rounded-xl border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#0A0A0A] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  <Video size={18} />
                  {startingCall ? "Starting Call..." : "Start Video Call"}
                </button>
              )}
              <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">
                Recording & transcription disabled in ghost mode
              </p>
            </div>

            {/* Vote to Save */}
            <VoteToSave
              roomId={roomId}
              totalParticipants={totalParticipants}
              totalVotes={totalVotes}
              hasVoted={hasVoted}
              onVote={handleVote}
            />

            {/* Participants */}
            <div className="bg-[var(--surface)] border-2 border-[#7C3AED] rounded-2xl shadow-[4px_4px_0_#7C3AED] p-5">
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                Participants ({totalParticipants})
              </h3>
              <div className="space-y-2">
                {room.participants?.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }}>
                      {p.displayName || p.name}
                      {p.userId === room.hostId && (
                        <span className="ml-1 text-[10px] text-[#7C3AED] font-bold">HOST</span>
                      )}
                    </span>
                    {p.votedToSave && <span className="text-[10px] text-green-600 font-bold">VOTED ✓</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Shared Notes */}
            <div className="bg-[var(--surface)] border-2 border-[#7C3AED] rounded-2xl shadow-[4px_4px_0_#7C3AED] p-5">
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
                📝 Shared Notes
              </h3>
              <textarea
                value={localNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Collaborative notes — everyone can edit. Auto-saves..."
                className="w-full h-28 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none resize-none focus:border-[#7C3AED] transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Notes are saved if everyone votes to keep the room.
              </p>
            </div>

            {/* Room Info */}
            <div className="bg-[var(--surface)] border-2 border-[var(--border)] rounded-2xl p-4 text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
              <p>Room Code: <span className="font-mono font-bold text-[#7C3AED]">{room.code}</span></p>
              <p className="mt-1">Share this code to invite others</p>
            </div>
          </div>
        </div>
      </motion.div>
    </GhostShield>
  );
}

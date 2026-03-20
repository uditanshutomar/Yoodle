"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Ghost, Plus, RefreshCw, Users, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface GhostRoomSummary {
  roomId: string;
  code: string;
  title: string;
  hostId: string;
  createdAt: string;
  expiresAt: string;
  participantCount: number;
}

export default function GhostRoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<GhostRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ghost-rooms", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = await res.json();
      if (!mountedRef.current) return;
      setRooms(json.data || []);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load rooms");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/ghost-rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      const room = json.data;
      if (room?.roomId) {
        router.push(`/ghost-rooms/${room.roomId}`);
      }
    } catch {
      setError("Failed to create ghost room");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinError(null);
    setJoining(true);
    try {
      // Join via PATCH with action: "join"
      const res = await fetch(`/api/ghost-rooms/${code}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Room not found (${res.status})`);
      }
      const json = await res.json();
      const roomId = json.data?.roomId || code;
      router.push(`/ghost-rooms/${roomId}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  const getTimeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight font-heading"
          style={{ textShadow: "2px 2px 0 #7C3AED" }}
        >
          Ghost Rooms
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)] font-body">
          Anonymous, ephemeral rooms that vanish when the conversation ends
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {/* Create Room */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Room title (optional)"
            className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none w-48"
          />
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_var(--border-strong)] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--border-strong)] transition-all cursor-pointer disabled:opacity-50 font-heading"
          >
            <Plus size={14} />
            {creating ? "Creating..." : "New Room"}
          </motion.button>
        </div>

        {/* Join Room */}
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Enter room code"
            className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-body focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:outline-none w-40 uppercase tracking-wider"
          />
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleJoin}
            disabled={joining || !joinCode.trim()}
            className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] shadow-[3px_3px_0_var(--border-strong)] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--border-strong)] transition-all cursor-pointer disabled:opacity-40 font-heading"
          >
            <Ghost size={14} />
            {joining ? "Joining..." : "Join"}
          </motion.button>
        </div>
      </div>
      {joinError && (
        <p className="text-xs text-[#FF6B6B] font-body">{joinError}</p>
      )}

      {/* Room List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-[var(--surface-hover)]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="rounded-2xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-6 py-4 text-center">
            <p className="text-sm font-bold text-[#FF6B6B] mb-3 font-heading">
              {error}
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={fetchRooms}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6B6B] bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 rounded-xl px-4 py-2 hover:bg-[#FF6B6B]/20 transition-colors font-heading cursor-pointer"
            >
              <RefreshCw size={14} /> Retry
            </motion.button>
          </div>
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#7C3AED] bg-[#7C3AED]/10 shadow-[4px_4px_0_#7C3AED]">
            <Ghost size={28} className="text-[#7C3AED]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
            No active ghost rooms
          </p>
          <p className="text-xs text-[var(--text-muted)] text-center max-w-xs font-body">
            Create a new room or join one with a code. Ghost rooms are anonymous, ephemeral, and vanish when they expire.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room, i) => (
            <motion.div
              key={room.roomId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/ghost-rooms/${room.roomId}`}
                className="group flex items-center gap-4 rounded-2xl border-2 border-[#7C3AED] bg-[var(--surface)] p-4 shadow-[3px_3px_0_#7C3AED] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#7C3AED] transition-all"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30">
                  <Ghost size={20} className="text-[#7C3AED]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate font-heading">
                    {room.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-body">
                      <Users size={11} /> {room.participantCount}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-body">
                      <Clock size={11} /> {getTimeLeft(room.expiresAt)}
                    </span>
                    <span className="text-[10px] font-mono text-[#7C3AED] font-bold tracking-wider">
                      {room.code}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-[var(--text-muted)] group-hover:text-[#7C3AED] transition-colors"
                />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

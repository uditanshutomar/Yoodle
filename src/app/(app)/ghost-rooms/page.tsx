"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Ghost, Plus, Clock, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface GhostRoomSummary {
  roomId: string;
  title: string;
  code: string;
  participantCount: number;
  createdAt: string;
  expiresAt: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function GhostRoomsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<GhostRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/ghost-rooms", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) setRooms(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const createRoom = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const res = await fetch("/api/ghost-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Ghost Room" }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        router.push(`/ghost-rooms/${data.data.roomId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  function getTimeRemaining(expiresAt: string) {
    const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED] border-2 border-[var(--border-strong)]">
            <Ghost size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              Ghost Rooms
            </h1>
            <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
              Ephemeral — everything vanishes when it ends
            </p>
          </div>
        </div>
        <Button variant="primary" size="md" icon={Plus} onClick={createRoom} disabled={creating} className="!bg-[#7C3AED] !border-[var(--border-strong)] !text-white">
          {creating ? "Creating…" : "New Ghost Room"}
        </Button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#7C3AED] border-t-transparent rounded-full" />
        </div>
      ) : rooms.length === 0 ? (
        <motion.div variants={itemVariants}>
          <EmptyState
            title="No ghost rooms"
            description="Create a ghost room for temporary, ephemeral meetings. Data vanishes when the room ends unless everyone votes to save."
            action={{ label: "Create Ghost Room", onClick: createRoom, icon: Plus }}
          />
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <Link key={room.roomId} href={`/ghost-rooms/${room.roomId}`}>
              <Card hover className="!p-5 cursor-pointer h-full !border-[#7C3AED] !shadow-[4px_4px_0_#7C3AED]">
                <div className="flex items-start justify-between mb-3">
                  <Badge variant="info">Ghost</Badge>
                  <span className="flex items-center gap-1 text-xs text-[#7C3AED] font-bold">
                    <Clock size={12} /> {getTimeRemaining(room.expiresAt)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                  {room.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] font-mono mb-3" style={{ fontFamily: "var(--font-body)" }}>
                  {room.code}
                </p>
                <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {room.participantCount}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

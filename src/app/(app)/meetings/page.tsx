"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Video, Plus, Calendar, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface MeetingSummary {
  id: string;
  title: string;
  code: string;
  status: string;
  type: string;
  scheduledAt?: string;
  participantCount: number;
  createdAt: string;
}

const statusColors: Record<string, "default" | "success" | "danger" | "info"> = {
  scheduled: "default",
  live: "success",
  ended: "info",
  cancelled: "danger",
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/meetings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setMeetings(
            data.data.map((m: Record<string, unknown>) => ({
              id: (m._id as string) || (m.id as string),
              title: m.title as string,
              code: m.code as string,
              status: m.status as string,
              type: m.type as string,
              scheduledAt: m.scheduledAt as string | undefined,
              participantCount: Array.isArray(m.participants) ? m.participants.length : 0,
              createdAt: m.createdAt as string,
            }))
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE600] border-2 border-[#0A0A0A]">
            <Video size={20} className="text-[#0A0A0A]" />
          </div>
          <h1 className="text-2xl font-black text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
            Meetings
          </h1>
        </div>
        <Button variant="primary" size="md" icon={Plus} href="/meetings/new">
          New Meeting
        </Button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#FFE600] border-t-transparent rounded-full" />
        </div>
      ) : meetings.length === 0 ? (
        <motion.div variants={itemVariants}>
          <EmptyState
            title="No meetings yet"
            description="Create your first meeting to get started. Invite your team and start collaborating!"
            action={{ label: "Create Meeting", onClick: () => router.push("/meetings/new"), icon: Plus }}
          />
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map((meeting) => (
            <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
              <Card hover className="!p-5 cursor-pointer h-full">
                <div className="flex items-start justify-between mb-3">
                  <Badge variant={statusColors[meeting.status] || "default"}>
                    {meeting.status === "live" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                    )}
                    {meeting.status}
                  </Badge>
                  {meeting.type === "ghost" && (
                    <Badge variant="info">Ghost</Badge>
                  )}
                </div>
                <h3 className="text-base font-bold text-[#0A0A0A] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                  {meeting.title}
                </h3>
                <p className="text-xs text-[#0A0A0A]/40 font-mono mb-3" style={{ fontFamily: "var(--font-body)" }}>
                  {meeting.code}
                </p>
                <div className="flex items-center gap-4 text-xs text-[#0A0A0A]/50">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {meeting.participantCount}
                  </span>
                  {meeting.scheduledAt && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {new Date(meeting.scheduledAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

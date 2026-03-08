"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Video, Plus, Ghost, Calendar, Film, Sparkles, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { YoodleMascotSmall } from "@/components/YoodleMascot";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface MeetingSummary {
  _id: string;
  title: string;
  code: string;
  status: string;
  scheduledAt?: string;
  participants: { userId: string; status: string }[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/meetings?status=scheduled&limit=5", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setMeetings(data.data);
        }
      })
      .catch(() => {});
  }, [user]);

  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Greeting */}
      <motion.div variants={itemVariants} className="flex items-center gap-4">
        <motion.div
          animate={{ rotate: [0, -5, 5, -3, 0] }}
          transition={{ duration: 2, delay: 0.5, repeat: Infinity, repeatDelay: 5 }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A]">
            <YoodleMascotSmall className="h-12 w-12 mix-blend-multiply" />
          </div>
        </motion.div>
        <div>
          <h1
            className="text-3xl font-black text-[#0A0A0A]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Hey, {firstName}!
          </h1>
          <p
            className="text-sm text-[#0A0A0A]/60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Ready to crush it today? Here&apos;s what&apos;s on your plate.
          </p>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants}>
        <h2
          className="text-lg font-bold text-[#0A0A0A] mb-3"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card hover className="!p-4 cursor-pointer">
            <Link href="/meetings/new" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE600] border-2 border-[#0A0A0A]">
                <Plus size={18} className="text-[#0A0A0A]" />
              </div>
              <div>
                <p
                  className="text-sm font-bold text-[#0A0A0A]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  New Meeting
                </p>
                <p
                  className="text-xs text-[#0A0A0A]/50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Start or schedule one
                </p>
              </div>
            </Link>
          </Card>

          <Card hover className="!p-4 cursor-pointer">
            <Link href="/meetings/join" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#06B6D4] border-2 border-[#0A0A0A]">
                <Video size={18} className="text-white" />
              </div>
              <div>
                <p
                  className="text-sm font-bold text-[#0A0A0A]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Join Meeting
                </p>
                <p
                  className="text-xs text-[#0A0A0A]/50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Drop into a call
                </p>
              </div>
            </Link>
          </Card>

          <Card hover className="!p-4 cursor-pointer">
            <Link href="/ghost-rooms" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED] border-2 border-[#0A0A0A]">
                <Ghost size={18} className="text-white" />
              </div>
              <div>
                <p
                  className="text-sm font-bold text-[#0A0A0A]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Ghost Room
                </p>
                <p
                  className="text-xs text-[#0A0A0A]/50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Drop-in audio vibes
                </p>
              </div>
            </Link>
          </Card>
        </div>
      </motion.div>

      {/* Two column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Meetings */}
        <motion.div variants={itemVariants}>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-[#0A0A0A]" />
                <h3
                  className="text-base font-bold text-[#0A0A0A]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Upcoming Meetings
                </h3>
              </div>
              <Badge variant="default">Today</Badge>
            </div>
            {meetings.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                description="Your calendar is wide open. Time to plan something awesome or just vibe."
                action={{
                  label: "Schedule a meeting",
                  onClick: () => router.push("/meetings/new"),
                  icon: Plus,
                }}
              />
            ) : (
              <div className="space-y-3">
                {meetings.map((m) => (
                  <Link key={m._id} href={`/meetings/${m._id}`}>
                    <div className="flex items-center justify-between rounded-xl border-2 border-[#0A0A0A]/10 p-3 hover:border-[#FFE600] transition-colors cursor-pointer">
                      <div>
                        <p className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>{m.title}</p>
                        <p className="text-xs text-[#0A0A0A]/40 font-mono">{m.code}</p>
                      </div>
                      <Badge variant="default">Scheduled</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Recent Recordings */}
        <motion.div variants={itemVariants}>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Film size={18} className="text-[#0A0A0A]" />
                <h3
                  className="text-base font-bold text-[#0A0A0A]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Recent Recordings
                </h3>
              </div>
              <Badge variant="info">New</Badge>
            </div>
            <EmptyState
              title="No recordings yet"
              description="Once you record a meeting, your playback and AI summaries will show up here."
            />
          </Card>
        </motion.div>
      </div>

      {/* AI Assistant preview */}
      <motion.div variants={itemVariants}>
        <Card className="relative overflow-hidden">
          {/* Gradient accent */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED]/5 via-transparent to-[#FFE600]/5 pointer-events-none" />

          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A]">
              <Sparkles size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="text-base font-bold text-[#0A0A0A] mb-1"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                AI Assistant
              </h3>
              <p
                className="text-sm text-[#0A0A0A]/60 mb-3"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Your personal meeting copilot. Get summaries, action items, and insights from any conversation.
              </p>
              <div className="bg-[#0A0A0A]/5 rounded-xl p-3 mb-3">
                <p
                  className="text-xs text-[#0A0A0A]/50 italic"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  &quot;Hey Yoodle, summarize my last standup and pull out the action items for me.&quot;
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowRight}
                href="/ai"
              >
                Open AI Assistant
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

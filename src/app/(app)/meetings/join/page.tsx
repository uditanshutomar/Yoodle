"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { Video, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useRouter, useSearchParams } from "next/navigation";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function JoinMeetingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill code from URL param (e.g. /meetings/join?code=yoo-abc-123)
  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setCode(codeParam.toLowerCase());
    }
  }, [searchParams]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Meeting codes are lowercase: yoo-xxx-xxx
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter a meeting code.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Use the meeting code directly — the [meetingId] route supports codes
      const res = await fetch(`/api/meetings/${encodeURIComponent(trimmed)}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (data.success && data.data) {
        const meeting = data.data;
        const meetingId = meeting._id || meeting.id;
        router.push(`/meetings/${meetingId}`);
      } else {
        setError(data.error?.message || "Meeting not found. Check the code and try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex items-center justify-center min-h-[60vh]"
    >
      <motion.div variants={itemVariants} className="w-full max-w-md">
        <Card className="!p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#06B6D4] border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A]">
              <Video size={22} className="text-white" />
            </div>
            <div>
              <h1
                className="text-2xl font-black text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Join Meeting
              </h1>
              <p
                className="text-sm text-[#0A0A0A]/50"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Enter the meeting code to drop in
              </p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Enter meeting code (e.g. yoo-abc-123)"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toLowerCase());
                  setError("");
                }}
                className="w-full rounded-xl border-2 border-[#0A0A0A]/15 bg-white py-3 px-4 text-center text-lg font-mono font-bold tracking-widest text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 placeholder:tracking-normal placeholder:font-normal placeholder:text-sm focus:border-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all"
                style={{ fontFamily: "var(--font-body)" }}
                autoFocus
              />
              {error && (
                <p
                  className="mt-2 text-sm text-[#FF6B6B] font-medium"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {error}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={ArrowRight}
              loading={loading}
              className="w-full justify-center"
            >
              Join Meeting
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#0A0A0A]/10 text-center">
            <p
              className="text-xs text-[#0A0A0A]/40"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Don&apos;t have a code?{" "}
              <button
                onClick={() => router.push("/meetings/new")}
                className="text-[#06B6D4] font-bold hover:underline cursor-pointer"
              >
                Create a new meeting
              </button>
            </p>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export default function JoinMeetingPage() {
  return (
    <Suspense>
      <JoinMeetingContent />
    </Suspense>
  );
}

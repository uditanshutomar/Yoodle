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

  // Auto-redirect when code is in URL (e.g. /meetings/join?code=yoo-abc-123)
  // Skip the code entry form entirely — go straight to lobby
  const [autoRedirecting, setAutoRedirecting] = useState(false);

  useEffect(() => {
    const codeParam = searchParams.get("code")?.trim().toLowerCase();
    if (codeParam) {
      setCode(codeParam);
      setAutoRedirecting(true);

      // Look up meeting by code and redirect to lobby
      fetch(`/api/meetings/${encodeURIComponent(codeParam)}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data) {
            const meetingId = data.data._id || data.data.id;
            router.replace(`/meetings/${meetingId}`);
          } else {
            // Code invalid — fall back to manual entry
            setAutoRedirecting(false);
            setError(data.error?.message || "Meeting not found. Check the code and try again.");
          }
        })
        .catch(() => {
          setAutoRedirecting(false);
          setError("Something went wrong. Please try again.");
        });
    }
  }, [searchParams, router]);

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

  // Show loading spinner while auto-redirecting from a shared link
  if (autoRedirecting) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        role="status"
        aria-label="Joining meeting"
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
      >
        <div className="h-10 w-10 rounded-full border-4 border-[#FFE600] border-t-transparent animate-spin" />
        <p className="text-sm text-[var(--text-secondary)] font-body">
          Joining meeting…
        </p>
      </motion.div>
    );
  }

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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#06B6D4] border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)]">
              <Video size={22} className="text-white" />
            </div>
            <div>
              <h1
                className="text-2xl font-black text-[var(--text-primary)] font-heading"
              >
                Join Meeting
              </h1>
              <p
                className="text-sm text-[var(--text-secondary)] font-body"
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
                aria-label="Meeting code"
                aria-invalid={!!error}
                aria-describedby={error ? "join-error" : undefined}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toLowerCase());
                  setError("");
                }}
                className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-3 px-4 text-center text-lg font-mono font-bold tracking-widest text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:tracking-normal placeholder:font-normal placeholder:text-sm focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all font-body"
                autoFocus
              />
              {error && (
                <p
                  id="join-error"
                  role="alert"
                  className="mt-2 text-sm text-[#FF6B6B] font-medium font-body"
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

          <div className="mt-6 pt-4 border-t border-[var(--border)] text-center">
            <p
              className="text-xs text-[var(--text-muted)] font-body"
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

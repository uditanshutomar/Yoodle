"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Video, ArrowLeft, Clock, Shield, Mic, Monitor, Users, Copy, Check, Link2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function NewMeetingPage() {
  const router = useRouter();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [settings, setSettings] = useState({
    allowRecording: false,
    allowScreenShare: true,
    waitingRoom: false,
    muteOnJoin: false,
  });
  const [loading, setLoading] = useState(false);
  const [startingNow, setStartingNow] = useState(false);
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");

  // After creation, show meeting code for sharing before navigating
  const [createdMeeting, setCreatedMeeting] = useState<{
    id: string;
    code: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const createMeeting = async (meetingTitle: string, isScheduled: boolean) => {
    const body: Record<string, unknown> = {
      title: meetingTitle,
      description: description.trim() || undefined,
      type: "regular",
      settings,
    };

    if (isScheduled && scheduledAt) {
      body.scheduledAt = new Date(scheduledAt).toISOString();
    }

    let res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    // If access token expired, try refreshing and retry once
    if (res.status === 401) {
      const refreshRes = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (refreshRes.ok) {
        res = await fetch("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      }
    }

    return res.json();
  };

  // Instant meeting — "Start Now" button creates and joins immediately
  const handleStartNow = async () => {
    setError("");
    setStartingNow(true);

    try {
      const meetingTitle = title.trim() || "Quick Meeting";
      const data = await createMeeting(meetingTitle, false);

      if (data.success && data.data) {
        const meeting = data.data;
        const id = meeting._id || meeting.id;
        const code = meeting.code;
        setCreatedMeeting({ id, code, title: meetingTitle });
      } else {
        setError(data.error?.message || data.message || "Failed to create meeting");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setStartingNow(false);
    }
  };

  // Scheduled meeting — requires a title
  const handleCreate = async () => {
    setTitleError("");
    setError("");

    if (!title.trim()) {
      setTitleError("Please enter a meeting title to continue");
      titleInputRef.current?.focus();
      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);

    try {
      const data = await createMeeting(title.trim(), scheduleMode === "later");

      if (data.success && data.data) {
        const meeting = data.data;
        const id = meeting._id || meeting.id;
        const code = meeting.code;

        if (scheduleMode === "now") {
          setCreatedMeeting({ id, code, title: title.trim() });
        } else {
          router.push(`/meetings`);
        }
      } else {
        setError(data.error?.message || data.message || "Failed to create meeting");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyMeetingLink = async () => {
    if (!createdMeeting) return;
    const link = `${window.location.origin}/meetings/join?code=${createdMeeting.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyMeetingCode = async () => {
    if (!createdMeeting) return;
    try {
      await navigator.clipboard.writeText(createdMeeting.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  // ── Meeting Created — Share Screen ──────────────────────────────────
  if (createdMeeting) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto mt-12"
      >
        <Card className="!p-8 text-center">
          {/* Success animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
            className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#10B981] border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] flex items-center justify-center"
          >
            <Check size={32} className="text-white" />
          </motion.div>

          <h2 className="text-2xl font-black text-[#0A0A0A] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
            Meeting Created!
          </h2>
          <p className="text-sm text-[#0A0A0A]/50 mb-6" style={{ fontFamily: "var(--font-body)" }}>
            Share this code with others so they can join
          </p>

          {/* Meeting code display */}
          <div className="bg-[#FAFAF8] border-2 border-[#0A0A0A]/15 rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1" style={{ fontFamily: "var(--font-heading)" }}>
              MEETING CODE
            </p>
            <div className="flex items-center justify-center gap-3">
              <span
                className="text-2xl font-black font-mono tracking-widest text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {createdMeeting.code}
              </span>
              <button
                onClick={copyMeetingCode}
                className="p-2 rounded-lg bg-white border-2 border-[#0A0A0A]/15 hover:border-[#0A0A0A]/30 transition-all cursor-pointer"
                title="Copy code"
              >
                {copied ? <Check size={16} className="text-[#10B981]" /> : <Copy size={16} className="text-[#0A0A0A]/50" />}
              </button>
            </div>
          </div>

          {/* Copy full link */}
          <button
            onClick={copyMeetingLink}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30 transition-all cursor-pointer mb-6 text-sm font-bold text-[#0A0A0A]/70"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Link2 size={16} />
            {copied ? "Copied!" : "Copy Meeting Link"}
          </button>

          <p className="text-xs text-[#0A0A0A]/40 mb-4" style={{ fontFamily: "var(--font-body)" }}>
            Others can join at <span className="font-mono">/meetings/join</span> using the code above
          </p>

          {/* Join button */}
          <Button
            variant="primary"
            size="lg"
            icon={Video}
            onClick={() => router.push(`/meetings/${createdMeeting.id}`)}
            className="w-full"
          >
            Join Meeting Now
          </Button>
        </Card>
      </motion.div>
    );
  }

  // ── Create Meeting Form ─────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" icon={ArrowLeft} href="/meetings">
          Back
        </Button>
        <h1 className="text-2xl font-black text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
          New Meeting
        </h1>
      </div>

      {/* Form */}
      <Card>
        <div className="space-y-5">
          <Input
            ref={titleInputRef}
            label="Meeting Title"
            placeholder="e.g. Weekly Standup, Design Review..."
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError("");
            }}
            error={titleError}
            aria-required="true"
          />

          <div>
            <label className="text-sm font-bold text-[#0A0A0A] mb-1.5 block" style={{ fontFamily: "var(--font-heading)" }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this meeting about?"
              rows={3}
              className="w-full rounded-xl border-2 border-[#0A0A0A]/15 bg-white py-2.5 px-4 text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/40 focus:border-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all resize-none"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>

          {/* Schedule toggle */}
          <div>
            <label className="text-sm font-bold text-[#0A0A0A] mb-2 block" style={{ fontFamily: "var(--font-heading)" }}>
              When
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleStartNow}
                disabled={startingNow}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                  startingNow
                    ? "border-[#0A0A0A] bg-[#FFE600]/70 shadow-[3px_3px_0_#0A0A0A] opacity-70"
                    : "border-[#0A0A0A] bg-[#FFE600] shadow-[3px_3px_0_#0A0A0A] hover:shadow-[1px_1px_0_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px]"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Video size={16} /> {startingNow ? "Starting..." : "Start Now"}
              </button>
              <button
                onClick={() => setScheduleMode(scheduleMode === "later" ? "now" : "later")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                  scheduleMode === "later"
                    ? "border-[#0A0A0A] bg-[#FFE600] shadow-[3px_3px_0_#0A0A0A]"
                    : "border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Clock size={16} /> Schedule for Later
              </button>
            </div>

            {scheduleMode === "later" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-xl border-2 border-[#0A0A0A]/15 bg-white py-2.5 px-4 text-sm focus:border-[#0A0A0A] focus:outline-none"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </motion.div>
            )}
          </div>
        </div>
      </Card>

      {/* Settings */}
      <Card>
        <h3 className="text-base font-bold text-[#0A0A0A] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
          Meeting Settings
        </h3>
        <div className="space-y-3">
          {[
            { key: "allowRecording", icon: Video, label: "Allow Recording" },
            { key: "allowScreenShare", icon: Monitor, label: "Allow Screen Share" },
            { key: "waitingRoom", icon: Shield, label: "Waiting Room" },
            { key: "muteOnJoin", icon: Mic, label: "Mute on Join" },
          ].map(({ key, icon: Icon, label }) => (
            <label key={key} className="flex items-center justify-between py-2 cursor-pointer">
              <span className="flex items-center gap-2 text-sm text-[#0A0A0A]/70" style={{ fontFamily: "var(--font-heading)" }}>
                <Icon size={16} /> {label}
              </span>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))}
                className={`w-11 h-6 rounded-full transition-all cursor-pointer ${
                  settings[key as keyof typeof settings] ? "bg-[#FFE600]" : "bg-[#0A0A0A]/15"
                }`}
              >
                <motion.div
                  className="w-5 h-5 rounded-full bg-white border-2 border-[#0A0A0A] shadow-sm"
                  animate={{ x: settings[key as keyof typeof settings] ? 20 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </label>
          ))}
        </div>
      </Card>

      {/* Error banner */}
      {error && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#FF6B6B]/10 border-2 border-[#FF6B6B] rounded-xl px-4 py-3 text-center"
        >
          <p className="text-sm font-bold text-[#FF6B6B]" style={{ fontFamily: "var(--font-heading)" }}>
            {error}
          </p>
        </motion.div>
      )}

      {/* Create button */}
      <Button
        variant="primary"
        size="lg"
        loading={scheduleMode === "now" ? startingNow : loading}
        onClick={scheduleMode === "now" ? handleStartNow : handleCreate}
        className="w-full"
        icon={scheduleMode === "now" ? Video : Users}
      >
        {scheduleMode === "now" ? "Create & Join Meeting" : "Schedule Meeting"}
      </Button>
    </motion.div>
  );
}

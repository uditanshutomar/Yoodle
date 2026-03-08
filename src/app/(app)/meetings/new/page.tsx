"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Video, ArrowLeft, Clock, Shield, Mic, Monitor, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function NewMeetingPage() {
  const router = useRouter();
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
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Meeting title is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        type: "regular",
        settings,
      };

      if (scheduleMode === "later" && scheduledAt) {
        body.scheduledAt = new Date(scheduledAt).toISOString();
      }

      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success && data.data) {
        const id = data.data._id || data.data.id;
        router.push(`/meetings/${id}`);
      } else {
        setError(data.error || "Failed to create meeting");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            label="Meeting Title"
            placeholder="e.g. Weekly Standup, Design Review..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
                onClick={() => setScheduleMode("now")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                  scheduleMode === "now"
                    ? "border-[#0A0A0A] bg-[#FFE600] shadow-[3px_3px_0_#0A0A0A]"
                    : "border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Video size={16} /> Start Now
              </button>
              <button
                onClick={() => setScheduleMode("later")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                  scheduleMode === "later"
                    ? "border-[#0A0A0A] bg-[#FFE600] shadow-[3px_3px_0_#0A0A0A]"
                    : "border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Clock size={16} /> Schedule
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

      {error && (
        <p className="text-sm text-[#FF6B6B] text-center" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      )}

      {/* Create button */}
      <Button variant="primary" size="lg" loading={loading} onClick={handleCreate} className="w-full" icon={Users}>
        {scheduleMode === "now" ? "Create & Join Meeting" : "Schedule Meeting"}
      </Button>
    </motion.div>
  );
}

"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Video, ArrowLeft, Clock, Shield, Mic, Monitor, Users, Copy, Check, Link2, FileText, ChevronDown, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface MeetingTemplateOption {
  _id: string;
  name: string;
  description?: string;
  defaultDuration: number;
  meetingSettings: {
    maxParticipants?: number;
    waitingRoom?: boolean;
    muteOnJoin?: boolean;
  };
}

export default function NewMeetingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-3 border-[#FFE600] border-t-transparent rounded-full animate-spin" /></div>}>
      <NewMeetingPageInner />
    </Suspense>
  );
}

function NewMeetingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(searchParams.get("title") || "");
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

  // Template picker state
  const [templates, setTemplates] = useState<MeetingTemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MeetingTemplateOption | null>(null);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/meetings/templates", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data)) {
            setTemplates(data.data);
          }
        }
      } catch {
        // Silent — template picker is optional
      }
    }
    fetchTemplates();
  }, []);

  const applyTemplate = (template: MeetingTemplateOption | null) => {
    setSelectedTemplate(template);
    setTemplateDropdownOpen(false);
    if (template) {
      // Apply template settings as defaults
      setSettings((s) => ({
        ...s,
        waitingRoom: template.meetingSettings.waitingRoom ?? s.waitingRoom,
        muteOnJoin: template.meetingSettings.muteOnJoin ?? s.muteOnJoin,
      }));
    }
  };

  // After creation, show meeting code for sharing before navigating
  const [createdMeeting, setCreatedMeeting] = useState<{
    id: string;
    code: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleanup copied timer on unmount
  useEffect(() => {
    return () => { clearTimeout(copiedTimerRef.current); };
  }, []);

  const createMeeting = async (meetingTitle: string, isScheduled: boolean) => {
    const body: Record<string, unknown> = {
      title: meetingTitle,
      description: description.trim() || undefined,
      type: "regular",
      settings,
    };

    if (selectedTemplate) {
      body.templateId = selectedTemplate._id;
    }

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
    if (startingNow) return;
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
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyMeetingCode = async () => {
    if (!createdMeeting) return;
    try {
      await navigator.clipboard.writeText(createdMeeting.code);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
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
            className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#10B981] border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] flex items-center justify-center"
          >
            <Check size={32} className="text-white" />
          </motion.div>

          <h2 className="text-2xl font-black text-[var(--text-primary)] mb-1 font-heading">
            Meeting Created!
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 font-body">
            Share this code with others so they can join
          </p>

          {/* Meeting code display */}
          <div className="bg-[var(--surface-hover)] border-2 border-[var(--border)] rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-[var(--text-muted)] mb-1 font-heading">
              MEETING CODE
            </p>
            <div className="flex items-center justify-center gap-3">
              <span
                className="text-2xl font-black font-mono tracking-widest text-[var(--text-primary)] font-heading"
              >
                {createdMeeting.code}
              </span>
              <button
                onClick={copyMeetingCode}
                className="p-2 rounded-lg bg-[var(--surface)] border-2 border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer"
                title="Copy code"
                aria-label="Copy meeting code"
              >
                {copied ? <Check size={16} className="text-[#10B981]" /> : <Copy size={16} className="text-[var(--text-secondary)]" />}
              </button>
            </div>
          </div>

          {/* Copy full link */}
          <button
            onClick={copyMeetingLink}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] transition-all cursor-pointer mb-6 text-sm font-bold text-[var(--text-secondary)] font-heading"
          >
            <Link2 size={16} />
            {copied ? "Copied!" : "Copy Meeting Link"}
          </button>

          <p className="text-xs text-[var(--text-muted)] mb-4 font-body">
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
        <h1 className="text-2xl font-black text-[var(--text-primary)] font-heading">
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
            <label className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block font-heading">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this meeting about?"
              rows={3}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2.5 px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all resize-none font-body"
            />
          </div>

          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <label className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block font-heading">
                Template (optional)
              </label>
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={templateDropdownOpen}
                  onClick={() => setTemplateDropdownOpen((o) => !o)}
                  className={`w-full flex items-center justify-between rounded-xl border-2 bg-[var(--surface)] py-2.5 px-4 text-sm transition-all cursor-pointer ${
                    selectedTemplate
                      ? "border-[#FFE600] ring-2 ring-[#FFE600]/30"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]"
                  } font-body`}
                >
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-[var(--text-muted)]" />
                    {selectedTemplate ? (
                      <span className="text-[var(--text-primary)]">{selectedTemplate.name}</span>
                    ) : (
                      <span className="text-[var(--text-muted)]">Choose a template...</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    {selectedTemplate && (
                      <button
                        type="button"
                        aria-label="Clear template selection"
                        onClick={(e) => { e.stopPropagation(); applyTemplate(null); }}
                        className="p-0.5 rounded hover:bg-[var(--surface-hover)] transition-colors"
                      >
                        <X size={14} className="text-[var(--text-muted)]" />
                      </button>
                    )}
                    <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${templateDropdownOpen ? "rotate-180" : ""}`} />
                  </span>
                </button>

                <AnimatePresence>
                  {templateDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      role="listbox"
                      aria-label="Meeting templates"
                      className="absolute z-20 mt-1 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden"
                    >
                      {templates.map((t) => (
                        <button
                          key={t._id}
                          type="button"
                          role="option"
                          aria-selected={selectedTemplate?._id === t._id}
                          onClick={() => applyTemplate(t)}
                          className={`w-full text-left px-4 py-3 hover:bg-[#FFE600]/10 transition-colors border-b border-[var(--border)] last:border-b-0 cursor-pointer ${
                            selectedTemplate?._id === t._id ? "bg-[#FFE600]/10" : ""
                          }`}
                        >
                          <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
                            {t.name}
                          </p>
                          {t.description && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1 font-body">
                              {t.description}
                            </p>
                          )}
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-body">
                            {t.defaultDuration} min
                            {t.meetingSettings.waitingRoom && " \u00B7 Waiting room"}
                            {t.meetingSettings.muteOnJoin && " \u00B7 Mute on join"}
                          </p>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Schedule toggle */}
          <div>
            <label className="text-sm font-bold text-[var(--text-primary)] mb-2 block font-heading">
              When
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleStartNow}
                disabled={startingNow}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                  startingNow
                    ? "border-[var(--border-strong)] bg-[#FFE600]/70 shadow-[3px_3px_0_var(--border-strong)] opacity-70"
                    : "border-[var(--border-strong)] bg-[#FFE600] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px]"
                } font-heading`}
              >
                <Video size={16} /> {startingNow ? "Starting..." : "Start Now"}
              </button>
              <button
                onClick={() => setScheduleMode(scheduleMode === "later" ? "now" : "later")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                  scheduleMode === "later"
                    ? "border-[var(--border-strong)] bg-[#FFE600] shadow-[3px_3px_0_var(--border-strong)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                } font-heading`}
              >
                <Clock size={16} /> Schedule for Later
              </button>
            </div>

            {scheduleMode === "later" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
                <input
                  type="datetime-local"
                  aria-label="Schedule date and time"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2.5 px-4 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none font-body"
                />
              </motion.div>
            )}
          </div>
        </div>
      </Card>

      {/* Settings */}
      <Card>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 font-heading">
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
              <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)] font-heading">
                <Icon size={16} /> {label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings[key as keyof typeof settings]}
                onClick={() => setSettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))}
                className={`w-11 h-6 rounded-full transition-all cursor-pointer ${
                  settings[key as keyof typeof settings] ? "bg-[#FFE600]" : "bg-[var(--border)]"
                }`}
              >
                <motion.div
                  className="w-5 h-5 rounded-full bg-[var(--surface)] border-2 border-[var(--border-strong)] shadow-sm"
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
          <p className="text-sm font-bold text-[#FF6B6B] font-heading">
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

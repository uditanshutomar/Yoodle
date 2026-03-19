"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit3, Clock, Shield, Mic, ArrowLeft, X, Check, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";

interface MeetingTemplate {
  _id: string;
  name: string;
  description?: string;
  defaultDuration: number;
  agendaSkeleton: string[];
  preMeetingChecklist: string[];
  cascadeConfig: {
    createMomDoc: boolean;
    createTasks: boolean;
    sendFollowUpEmail: boolean;
    appendToSheet: boolean;
    scheduleNextMeeting: boolean;
  };
  meetingSettings: {
    maxParticipants?: number;
    waitingRoom?: boolean;
    muteOnJoin?: boolean;
  };
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

type FormData = {
  name: string;
  description: string;
  defaultDuration: number;
  waitingRoom: boolean;
  muteOnJoin: boolean;
  maxParticipants: number;
};

const DEFAULT_FORM: FormData = {
  name: "",
  description: "",
  defaultDuration: 30,
  waitingRoom: false,
  muteOnJoin: false,
  maxParticipants: 25,
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings/templates", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setTemplates(data.data);
      } else {
        console.warn("[Templates] Fetch failed:", res.status);
      }
    } catch (err) {
      console.warn("[Templates] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
    setError("");
  };

  const openEdit = (t: MeetingTemplate) => {
    setEditingId(t._id);
    setForm({
      name: t.name,
      description: t.description || "",
      defaultDuration: t.defaultDuration,
      waitingRoom: t.meetingSettings.waitingRoom ?? false,
      muteOnJoin: t.meetingSettings.muteOnJoin ?? false,
      maxParticipants: t.meetingSettings.maxParticipants ?? 25,
    });
    setShowForm(true);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Template name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        defaultDuration: form.defaultDuration,
        meetingSettings: {
          waitingRoom: form.waitingRoom,
          muteOnJoin: form.muteOnJoin,
          maxParticipants: form.maxParticipants,
        },
      };

      const url = editingId
        ? `/api/meetings/templates/${editingId}`
        : "/api/meetings/templates";

      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setShowForm(false);
        fetchTemplates();
      } else {
        setError(data.error?.message || "Failed to save template");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/meetings/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t._id !== id));
      } else {
        console.warn("[Templates] Delete failed:", res.status);
      }
    } catch (err) {
      console.warn("[Templates] Delete error:", err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/meetings">
            <Button variant="ghost" size="sm" icon={ArrowLeft}>
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Meeting Templates
          </h1>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
          New Template
        </Button>
      </div>

      {/* Create/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                  {editingId ? "Edit Template" : "New Template"}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <Input
                  label="Template Name"
                  placeholder="e.g. Weekly Standup, Sprint Retro..."
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />

                <div>
                  <label className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block" style={{ fontFamily: "var(--font-heading)" }}>
                    Description (optional)
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What is this template for?"
                    rows={2}
                    className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2.5 px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all resize-none"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block" style={{ fontFamily: "var(--font-heading)" }}>
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={form.defaultDuration}
                      onChange={(e) => setForm((f) => ({ ...f, defaultDuration: Math.max(5, Math.min(480, parseInt(e.target.value) || 30)) }))}
                      min={5}
                      max={480}
                      className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2.5 px-4 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-[var(--text-primary)] mb-1.5 block" style={{ fontFamily: "var(--font-heading)" }}>
                      Max Participants
                    </label>
                    <input
                      type="number"
                      value={form.maxParticipants}
                      onChange={(e) => setForm((f) => ({ ...f, maxParticipants: Math.max(1, Math.min(100, parseInt(e.target.value) || 25)) }))}
                      min={1}
                      max={100}
                      className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2.5 px-4 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                  </div>
                </div>

                {/* Setting toggles */}
                <div className="space-y-2">
                  {[
                    { key: "waitingRoom" as const, icon: Shield, label: "Waiting Room" },
                    { key: "muteOnJoin" as const, icon: Mic, label: "Mute on Join" },
                  ].map(({ key, icon: Icon, label }) => (
                    <label key={key} className="flex items-center justify-between py-1.5 cursor-pointer">
                      <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-heading)" }}>
                        <Icon size={14} /> {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
                        className={`w-10 h-5 rounded-full transition-all cursor-pointer ${
                          form[key] ? "bg-[#FFE600]" : "bg-[var(--border)]"
                        }`}
                      >
                        <motion.div
                          className="w-4 h-4 rounded-full bg-[var(--surface)] border-2 border-[var(--border-strong)] shadow-sm"
                          animate={{ x: form[key] ? 18 : 2 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      </button>
                    </label>
                  ))}
                </div>

                {error && (
                  <p className="text-sm text-[#FF6B6B] font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <Button variant="primary" loading={saving} onClick={handleSave} icon={Check} className="flex-1">
                    {editingId ? "Save Changes" : "Create Template"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template list */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 mx-auto border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 && !showForm ? (
        <EmptyState
          title="No templates yet"
          description="Create reusable meeting templates with pre-configured settings to save time when scheduling meetings."
          action={{ label: "Create Template", onClick: openCreate, icon: Plus }}
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <motion.div
              key={t._id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="!p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] truncate" style={{ fontFamily: "var(--font-heading)" }}>
                      {t.name}
                    </h3>
                    {t.description && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1" style={{ fontFamily: "var(--font-body)" }}>
                        {t.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {t.defaultDuration} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={10} /> {t.meetingSettings.maxParticipants ?? 25} max
                      </span>
                      {t.meetingSettings.waitingRoom && (
                        <span className="flex items-center gap-1">
                          <Shield size={10} /> Waiting room
                        </span>
                      )}
                      {t.meetingSettings.muteOnJoin && (
                        <span className="flex items-center gap-1">
                          <Mic size={10} /> Mute on join
                        </span>
                      )}
                      <span className="ml-auto">{t.usageCount} uses</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-2 rounded-lg hover:bg-[#FFE600]/20 transition-colors cursor-pointer"
                      title="Edit template"
                    >
                      <Edit3 size={14} className="text-[var(--text-secondary)]" />
                    </button>
                    <button
                      onClick={() => handleDelete(t._id)}
                      disabled={deleting === t._id}
                      className="p-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                      title="Delete template"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

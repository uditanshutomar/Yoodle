"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import type { PendingAction } from "@/hooks/usePendingActions";

/* ─── Types ─── */
interface APITask {
    id: string;
    title: string;
    notes?: string;
    status: "needsAction" | "completed";
    due?: string;
}

interface TasksPanelProps {
  pendingActions?: PendingAction[];
  onConfirmAction?: (actionId: string) => void;
  onDenyAction?: (actionId: string) => void;
  onReviseAction?: (actionId: string, feedback: string) => void;
}

/* ─── ActionCard ─── */
function ActionCard({
  action,
  onConfirm,
  onDeny,
  onRevise,
}: {
  action: PendingAction;
  onConfirm: () => void;
  onDeny: () => void;
  onRevise: (feedback: string) => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [editText, setEditText] = useState("");

  const iconMap: Record<string, string> = {
    send_email: "\u{1F4E7}",
    reply_to_email: "\u{1F4E7}",
    create_calendar_event: "\u{1F4C5}",
    update_calendar_event: "\u{1F4C5}",
    delete_calendar_event: "\u{1F4C5}",
    create_task: "\u2713",
    complete_task: "\u2713",
    update_task: "\u2713",
    delete_task: "\u2713",
    append_to_doc: "\u{1F4C4}",
    find_replace_in_doc: "\u{1F4C4}",
    write_sheet: "\u{1F4CA}",
    append_to_sheet: "\u{1F4CA}",
    clear_sheet_range: "\u{1F4CA}",
  };

  const icon = iconMap[action.actionType] || "\u26A1";
  const isLoading = action.status === "confirming" || action.status === "revising";

  // Build detail lines from args
  const details: string[] = [];
  if (action.args.to) details.push(`To: ${(action.args.to as string[]).join(", ")}`);
  if (action.args.subject) details.push(`Subject: ${action.args.subject}`);
  if (action.args.title) details.push(`${action.args.title}`);
  if (action.args.start) details.push(`${new Date(action.args.start as string).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
  if (action.args.attendees) details.push(`With: ${(action.args.attendees as string[]).join(", ")}`);

  const handleRevise = () => {
    if (!editText.trim()) return;
    onRevise(editText.trim());
    setEditText("");
    setShowEdit(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-[1.5px] border-[#FFE600]/40 bg-[#FFE600]/5 p-2.5"
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug">
            {action.summary}
          </p>
          {details.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {details.map((d, i) => (
                <p key={i} className="text-[10px] text-[var(--text-muted)] truncate">{d}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {action.status === "pending" && (
        <div className="flex items-center gap-1.5 mt-2 ml-6">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onConfirm}
            className="flex items-center gap-1 rounded-full bg-[#22C55E] text-white px-2.5 py-1 text-[10px] font-bold hover:bg-[#16A34A] transition-colors"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Accept
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onDeny}
            className="flex items-center gap-1 rounded-full bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30 px-2.5 py-1 text-[10px] font-bold hover:bg-[#EF4444]/20 transition-colors"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Deny
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowEdit(!showEdit)}
            className="flex items-center gap-1 rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold hover:bg-[var(--surface-elevated)] transition-colors"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </motion.button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 mt-2 ml-6">
          <div className="h-3 w-3 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] text-[var(--text-muted)]">
            {action.status === "confirming" ? "Executing..." : "Revising..."}
          </span>
        </div>
      )}

      {/* Success state */}
      {action.status === "confirmed" && (
        <div className="flex items-center gap-2 mt-2 ml-6">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[10px] font-semibold text-[#22C55E]">
            {action.result || "Done"}
          </span>
        </div>
      )}

      {/* Edit input */}
      <AnimatePresence>
        {showEdit && action.status === "pending" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2 ml-6"
          >
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRevise()}
                placeholder="Tell Doodle what to change..."
                autoFocus
                className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                style={{ fontFamily: "var(--font-body)" }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleRevise}
                disabled={!editText.trim()}
                className="text-[10px] font-bold text-[#FFE600] px-2 py-0.5 rounded-full hover:bg-[#FFE600]/10 disabled:opacity-40 transition-colors"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Revise
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Component ─── */
export default function TasksPanel({ pendingActions, onConfirmAction, onDenyAction, onReviseAction }: TasksPanelProps) {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<APITask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [creating, setCreating] = useState(false);
    const [showInput, setShowInput] = useState(false);

    const hasGoogle = user?.hasGoogleAccess;

    /* ── Fetch tasks ── */
    const fetchTasks = useCallback(async () => {
        if (!hasGoogle) {
            setLoading(false);
            return;
        }
        try {
            const res = await fetch("/api/tasks?maxResults=20", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setTasks(data.data || []);
            setError(null);
        } catch {
            setError("Couldn't load tasks.");
        } finally {
            setLoading(false);
        }
    }, [hasGoogle]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Refetch tasks when an action is confirmed (e.g. create_task was executed)
    useEffect(() => {
        if (pendingActions?.some((a) => a.status === "confirmed")) {
            fetchTasks();
        }
    }, [pendingActions, fetchTasks]);

    /* ── Create task ── */
    const handleCreate = async () => {
        const title = newTitle.trim();
        if (!title || creating) return;
        setCreating(true);
        try {
            const res = await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ title }),
            });
            if (!res.ok) throw new Error("Failed to create");
            const data = await res.json();
            setTasks((prev) => [data.data, ...prev]);
            setNewTitle("");
            setShowInput(false);
        } catch {
            // Silent — keep input open
        } finally {
            setCreating(false);
        }
    };

    /* ── Toggle complete ── */
    const toggleTask = async (task: APITask) => {
        const newStatus = task.status === "completed" ? "needsAction" : "completed";
        // Optimistic update
        setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
        );
        try {
            await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ status: newStatus }),
            });
        } catch {
            // Revert on failure
            setTasks((prev) =>
                prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
            );
        }
    };

    /* ── Format due date ── */
    const formatDue = (due?: string) => {
        if (!due) return null;
        const d = new Date(due);
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        if (d.toDateString() === today.toDateString()) return "Today";
        if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    const isDueOverdue = (due?: string) => {
        if (!due) return false;
        return new Date(due) < new Date(new Date().toDateString());
    };

    const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "needsAction"), [tasks]);
    const completedTasks = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);

    /* ── Loading skeleton ── */
    if (loading) {
        return (
            <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        Tasks
                    </h2>
                </div>
                <div className="animate-pulse space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-[var(--surface-hover)] rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 200, damping: 25 }}
            className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden p-4"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Tasks
                </h2>
                <div className="flex items-center gap-2">
                    {hasGoogle && (
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                            {pendingTasks.length} pending
                        </span>
                    )}
                    {hasGoogle && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setShowInput(!showInput)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[#22C55E]/10 hover:text-[#22C55E] hover:border-[#22C55E]/30 transition-colors"
                            title="Add task"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Not connected state */}
            {!hasGoogle ? (
                <div className="text-center py-6 px-2">
                    <div className="flex items-center justify-center mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-hover)] border border-[var(--border)]">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-xs font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                        Connect Google Tasks
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
                        Sync your Google Tasks to see and manage them here.
                    </p>
                    <motion.a
                        href="/settings"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-3 py-1.5 hover:bg-[#3B82F6]/20 transition-colors"
                        style={{ fontFamily: "var(--font-heading)" }}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        Connect in Settings
                    </motion.a>
                </div>
            ) : error ? (
                <div className="text-center py-6">
                    <p className="text-xs text-[#FF6B6B]/70">{error}</p>
                    <button onClick={fetchTasks} className="text-xs text-[#3B82F6] mt-2 hover:underline" style={{ fontFamily: "var(--font-heading)" }}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    {/* Add task input */}
                    <AnimatePresence>
                        {showInput && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mb-2"
                            >
                                <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-[#22C55E]/40 bg-[#22C55E]/5 p-2">
                                    <input
                                        type="text"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                        placeholder="New task title…"
                                        autoFocus
                                        className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                                        style={{ fontFamily: "var(--font-body)" }}
                                    />
                                    <motion.button
                                        whileTap={{ scale: 0.9 }}
                                        onClick={handleCreate}
                                        disabled={creating || !newTitle.trim()}
                                        className="flex h-6 items-center gap-1 rounded-full bg-[#22C55E] text-white px-3 text-[10px] font-bold disabled:opacity-40"
                                        style={{ fontFamily: "var(--font-heading)" }}
                                    >
                                        {creating ? "…" : "Add"}
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Pending AI Actions */}
                    {pendingActions && pendingActions.length > 0 && (
                        <>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="flex-1 h-px bg-[#FFE600]/30" />
                                <span className="text-[9px] font-bold text-[#FFE600] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                                    Doodle&apos;s Actions ({pendingActions.length})
                                </span>
                                <div className="flex-1 h-px bg-[#FFE600]/30" />
                            </div>
                            <div className="space-y-1.5 mb-3">
                                {pendingActions.map((action) => (
                                    <ActionCard
                                        key={action.actionId}
                                        action={action}
                                        onConfirm={() => onConfirmAction?.(action.actionId)}
                                        onDeny={() => onDenyAction?.(action.actionId)}
                                        onRevise={(feedback) => onReviseAction?.(action.actionId, feedback)}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    {/* Tasks list */}
                    {pendingTasks.length === 0 && completedTasks.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-6">
                            No tasks yet. Tap + to create one!
                        </p>
                    ) : (
                        <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
                            {/* Pending tasks */}
                            {pendingTasks.map((task, i) => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    delay={i * 0.03}
                                    onToggle={() => toggleTask(task)}
                                    formatDue={formatDue}
                                    isOverdue={isDueOverdue(task.due)}
                                />
                            ))}

                            {/* Completed separator */}
                            {completedTasks.length > 0 && pendingTasks.length > 0 && (
                                <div className="flex items-center gap-2 py-1.5">
                                    <div className="flex-1 h-px bg-[var(--border)]" />
                                    <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
                                        Done ({completedTasks.length})
                                    </span>
                                    <div className="flex-1 h-px bg-[var(--border)]" />
                                </div>
                            )}

                            {/* Completed tasks */}
                            {completedTasks.slice(0, 5).map((task) => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    delay={0}
                                    onToggle={() => toggleTask(task)}
                                    formatDue={formatDue}
                                    isOverdue={false}
                                    completed
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </motion.div>
    );
}

/* ─── Task Item ─── */
function TaskItem({
    task,
    delay,
    onToggle,
    formatDue,
    isOverdue,
    completed,
}: {
    task: APITask;
    delay: number;
    onToggle: () => void;
    formatDue: (due?: string) => string | null;
    isOverdue: boolean;
    completed?: boolean;
}) {
    const due = formatDue(task.due);

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className={`flex items-start gap-2.5 rounded-xl border-[1.5px] p-2.5 transition-all ${
                completed
                    ? "border-[var(--border)] opacity-50"
                    : "border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer"
            }`}
        >
            {/* Checkbox */}
            <motion.button
                whileTap={{ scale: 0.8 }}
                onClick={onToggle}
                className={`flex-shrink-0 mt-0.5 flex h-[16px] w-[16px] items-center justify-center rounded-full border-2 transition-colors ${
                    completed
                        ? "border-[#22C55E] bg-[#22C55E]"
                        : "border-[var(--border-strong)] hover:border-[#22C55E] hover:bg-[#22C55E]/10"
                }`}
            >
                {completed && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </motion.button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className={`text-[12px] font-semibold leading-snug ${
                    completed
                        ? "text-[var(--text-muted)] line-through"
                        : "text-[var(--text-primary)]"
                }`}>
                    {task.title}
                </p>
                {task.notes && !completed && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                        {task.notes}
                    </p>
                )}
            </div>

            {/* Due date */}
            {due && !completed && (
                <span
                    className={`flex-shrink-0 text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                        isOverdue
                            ? "text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30"
                            : due === "Today"
                                ? "text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30"
                                : "text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)]"
                    }`}
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    {due}
                </span>
            )}
        </motion.div>
    );
}

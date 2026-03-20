"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { nanoid } from "nanoid";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronDown,
  Calendar,
  Tag,
  User,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  Circle,
  MessageSquare,
  Activity,
  AlertTriangle,
  Clock,
  FileText,
  Mail,
  Link2,
  Users,
  Hash,
  CalendarRange,
  Sparkles,
  Bot,
  Video,
  ExternalLink,
} from "lucide-react";
import type { BoardTask, Board, LinkedDoc, LinkedEmail } from "@/hooks/useBoard";

export interface TaskDetailProps {
  task: BoardTask | null;
  board: Board | null;
  boardMembers?: { _id: string; name: string; displayName?: string; avatarUrl?: string }[];
  onClose: () => void;
  onUpdate: (taskId: string, data: Partial<BoardTask>) => Promise<BoardTask | undefined>;
  onDelete: (taskId: string) => Promise<void>;
}

/* ────────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────────── */

const PRIORITY_CONFIG: Record<
  BoardTask["priority"],
  { label: string; color: string; bg: string }
> = {
  urgent: { label: "Urgent", color: "#EF4444", bg: "#EF444415" },
  high: { label: "High", color: "#F97316", bg: "#F9731615" },
  medium: { label: "Medium", color: "#FFE600", bg: "#FFE60020" },
  low: { label: "Low", color: "#3B82F6", bg: "#3B82F615" },
  none: { label: "None", color: "#6B7280", bg: "#6B728015" },
};

const PRIORITIES: BoardTask["priority"][] = ["urgent", "high", "medium", "low", "none"];

type DetailTab = "comments" | "activity";

interface CommentEntry {
  _id: string;
  authorId: string;
  type: "comment" | "activity";
  content: string;
  changes?: { field: string; from: string; to: string };
  createdAt: string;
}

/* ────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */

export default function TaskDetail({
  task,
  board,
  boardMembers,
  onClose,
  onUpdate,
  onDelete,
}: TaskDetailProps) {
  return (
    <AnimatePresence>
      {task && (
        <TaskDetailInner
          key={task._id}
          task={task}
          board={board}
          boardMembers={boardMembers}
          onClose={onClose}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </AnimatePresence>
  );
}

/* ────────────────────────────────────────────────────────────
   Inner (remounts per task via key)
   ──────────────────────────────────────────────────────────── */

interface Subtask {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: string;
}

function TaskDetailInner({
  task,
  board,
  boardMembers = [],
  onClose,
  onUpdate,
  onDelete,
}: {
  task: BoardTask;
  board: Board | null;
  boardMembers?: { _id: string; name: string; displayName?: string; avatarUrl?: string }[];
  onClose: () => void;
  onUpdate: (taskId: string, data: Partial<BoardTask>) => Promise<BoardTask | undefined>;
  onDelete: (taskId: string) => Promise<void>;
}) {
  /* ── Local state ── */
  const [title, setTitle] = useState(task.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(task.description || "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [priority, setPriority] = useState(task.priority);
  const [columnId, setColumnId] = useState(task.columnId);
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [startDate, setStartDate] = useState(task.startDate || "");
  const [estimatePoints, setEstimatePoints] = useState<number | null>(task.estimatePoints ?? null);
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assigneeId || null);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>(task.linkedDocs || []);
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmail[]>(task.linkedEmails || []);
  const [meetingId, setMeetingId] = useState<string | null>(task.meetingId || null);
  const [meetingData, setMeetingData] = useState<{ _id: string; title: string; status: string; scheduledAt?: string; code?: string } | null>(null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [showMeetingSearch, setShowMeetingSearch] = useState(false);
  const [meetingSearchQuery, setMeetingSearchQuery] = useState("");
  const [meetingSearchResults, setMeetingSearchResults] = useState<{ _id: string; title: string; status: string; scheduledAt?: string; code?: string }[]>([]);
  const [meetingSearching, setMeetingSearching] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(task.labels);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);
  const [newSubtask, setNewSubtask] = useState("");
  const [tab, setTab] = useState<DetailTab>("comments");
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Dropdown toggles
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);

  // Linked doc add form
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocUrl, setNewDocUrl] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  /* ── Close on Escape (skip if a dropdown is open) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // If a dropdown menu is open, close it first instead of closing the drawer
      if (showPriorityMenu || showColumnMenu || showLabelMenu || showAssigneeMenu || showDeleteConfirm || showMeetingSearch) {
        setShowPriorityMenu(false);
        setShowColumnMenu(false);
        setShowLabelMenu(false);
        setShowAssigneeMenu(false);
        setShowDeleteConfirm(false);
        setShowMeetingSearch(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, showPriorityMenu, showColumnMenu, showLabelMenu, showAssigneeMenu, showDeleteConfirm, showMeetingSearch]);

  /* ── Focus helpers ── */
  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingDesc && descRef.current) descRef.current.focus();
  }, [editingDesc]);

  const [commentsError, setCommentsError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ── Fetch comments & activity ── */
  const fetchComments = useCallback(async () => {
    if (!task.boardId) return;
    setCommentsError(null);
    try {
      const res = await fetch(
        `/api/boards/${task.boardId}/tasks/${task._id}/comments`,
        { credentials: "include" }
      );
      if (!mountedRef.current) return;
      if (res.ok) {
        const json = await res.json();
        if (mountedRef.current) setComments(json.data || []);
      } else {
        setCommentsError("Failed to load comments");
      }
    } catch {
      if (mountedRef.current) setCommentsError("Failed to load comments");
    } finally {
      if (mountedRef.current) setCommentsLoading(false);
    }
  }, [task.boardId, task._id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const submitComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !task.boardId) return;
    setCommentText("");
    setCommentsError(null);
    try {
      const res = await fetch(
        `/api/boards/${task.boardId}/tasks/${task._id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: trimmed }),
        }
      );
      if (res.ok) {
        fetchComments();
      } else {
        setCommentText(trimmed);
        setCommentsError("Failed to post comment");
      }
    } catch {
      // restore text on failure
      setCommentText(trimmed);
      setCommentsError("Failed to post comment");
    }
  }, [commentText, task.boardId, task._id, fetchComments]);

  /* ── Persist helpers ── */
  const persist = useCallback(
    (data: Partial<BoardTask>) => {
      onUpdate(task._id, data).catch((err: unknown) => {
        console.error("[TaskDetail] Failed to save change:", err);
      });
    },
    [task._id, onUpdate]
  );

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) persist({ title: trimmed });
    else setTitle(task.title);
  }, [title, task.title, persist]);

  const saveDescription = useCallback(() => {
    setEditingDesc(false);
    if (description !== (task.description || "")) persist({ description });
  }, [description, task.description, persist]);

  const changePriority = useCallback(
    (p: BoardTask["priority"]) => {
      setPriority(p);
      setShowPriorityMenu(false);
      persist({ priority: p });
    },
    [persist]
  );

  const changeColumn = useCallback(
    (colId: string) => {
      setColumnId(colId);
      setShowColumnMenu(false);
      persist({ columnId: colId });
    },
    [persist]
  );

  const changeDueDate = useCallback(
    (val: string) => {
      setDueDate(val);
      persist({ dueDate: val || undefined });
    },
    [persist]
  );

  const changeStartDate = useCallback(
    (val: string) => {
      setStartDate(val);
      persist({ startDate: val || undefined });
    },
    [persist]
  );

  const changeEstimate = useCallback(
    (val: string) => {
      const num = val === "" ? null : parseInt(val, 10);
      setEstimatePoints(num);
      persist({ estimatePoints: num ?? undefined } as Partial<BoardTask>);
    },
    [persist]
  );

  const changeAssignee = useCallback(
    (userId: string | null) => {
      setAssigneeId(userId);
      setShowAssigneeMenu(false);
      persist({ assigneeId: userId ?? undefined } as Partial<BoardTask>);
    },
    [persist]
  );

  const addLinkedDoc = useCallback(() => {
    if (!newDocUrl.trim()) return;
    const docType = detectDocType(newDocUrl);
    const doc: LinkedDoc = {
      googleDocId: newDocUrl, // use URL as ID for non-google docs
      title: newDocTitle.trim() || new URL(newDocUrl).hostname,
      url: newDocUrl.trim(),
      type: docType,
    };
    const next = [...linkedDocs, doc];
    setLinkedDocs(next);
    setNewDocUrl("");
    setNewDocTitle("");
    setShowAddDoc(false);
    persist({ linkedDocs: next } as Partial<BoardTask>);
  }, [newDocUrl, newDocTitle, linkedDocs, persist]);

  const removeLinkedDoc = useCallback(
    (index: number) => {
      const next = linkedDocs.filter((_, i) => i !== index);
      setLinkedDocs(next);
      persist({ linkedDocs: next } as Partial<BoardTask>);
    },
    [linkedDocs, persist]
  );

  const removeLinkedEmail = useCallback(
    (index: number) => {
      const next = linkedEmails.filter((_, i) => i !== index);
      setLinkedEmails(next);
      persist({ linkedEmails: next } as Partial<BoardTask>);
    },
    [linkedEmails, persist]
  );

  /* ── Related Meeting ── */
  useEffect(() => {
    if (!meetingId) { setMeetingData(null); return; }
    let cancelled = false;
    setMeetingLoading(true);
    fetch(`/api/meetings/${meetingId}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) {
          setMeetingData({ _id: json.data._id, title: json.data.title, status: json.data.status, scheduledAt: json.data.scheduledAt, code: json.data.code });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMeetingLoading(false); });
    return () => { cancelled = true; };
  }, [meetingId]);

  const meetingSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchMeetings = useCallback((query: string) => {
    setMeetingSearchQuery(query);
    if (meetingSearchDebounceRef.current) clearTimeout(meetingSearchDebounceRef.current);
    if (query.trim().length < 2) { setMeetingSearchResults([]); return; }
    meetingSearchDebounceRef.current = setTimeout(async () => {
      setMeetingSearching(true);
      try {
        const res = await fetch(`/api/meetings?limit=10`, { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const meetings = (json.data || []) as { _id: string; title: string; status: string; scheduledAt?: string; code?: string }[];
          const q = query.trim().toLowerCase();
          setMeetingSearchResults(meetings.filter((m) => m.title.toLowerCase().includes(q)));
        }
      } catch { /* non-fatal */ }
      finally { setMeetingSearching(false); }
    }, 300);
  }, []);

  const linkMeeting = useCallback(
    (mId: string, data: { _id: string; title: string; status: string; scheduledAt?: string; code?: string }) => {
      setMeetingId(mId);
      setMeetingData(data);
      setShowMeetingSearch(false);
      setMeetingSearchQuery("");
      setMeetingSearchResults([]);
      persist({ meetingId: mId } as Partial<BoardTask>);
    },
    [persist]
  );

  const unlinkMeeting = useCallback(() => {
    setMeetingId(null);
    setMeetingData(null);
    persist({ meetingId: null } as unknown as Partial<BoardTask>);
  }, [persist]);

  const toggleLabel = useCallback(
    (labelId: string) => {
      const next = selectedLabels.includes(labelId)
        ? selectedLabels.filter((l) => l !== labelId)
        : [...selectedLabels, labelId];
      setSelectedLabels(next);
      persist({ labels: next });
    },
    [selectedLabels, persist]
  );

  const toggleSubtask = useCallback(
    (id: string) => {
      const next = subtasks.map((s) =>
        s.id === id ? { ...s, done: !s.done } : s
      );
      setSubtasks(next);
      persist({ subtasks: next });
    },
    [subtasks, persist]
  );

  const addSubtask = useCallback(() => {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    const sub: Subtask = {
      id: `st_${nanoid(8)}`,
      title: trimmed,
      done: false,
    };
    const next = [...subtasks, sub];
    setSubtasks(next);
    setNewSubtask("");
    persist({ subtasks: next });
    subtaskInputRef.current?.focus();
  }, [newSubtask, subtasks, persist]);

  const removeSubtask = useCallback(
    (id: string) => {
      const next = subtasks.filter((s) => s.id !== id);
      setSubtasks(next);
      persist({ subtasks: next });
    },
    [subtasks, persist]
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await onDelete(task._id);
      onClose();
    } catch (err) {
      console.error("[TaskDetail] Failed to delete task:", err);
      setDeleting(false);
    }
  }, [task._id, onDelete, onClose]);

  /* ── Derived values ── */
  const col = board?.columns.find((c) => c.id === columnId);
  const doneCount = subtasks.filter((s) => s.done).length;
  const subtaskPercent = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;
  const created = new Date(task.createdAt);
  const createdStr = created.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const pCfg = PRIORITY_CONFIG[priority];

  /* ── Render ── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--foreground)]/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        role="dialog"
        aria-label={`Task details: ${task.title}`}
        aria-modal="true"
        className="relative ml-auto flex h-full w-full max-w-[540px] flex-col bg-[var(--background)] border-l-2 border-[var(--border-strong)] shadow-2xl"
      >
        {/* ────────── HEADER ────────── */}
        <div className="flex-shrink-0 border-b-2 border-[var(--border)] bg-[var(--surface)] px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Title */}
              {editingTitle ? (
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") {
                      setTitle(task.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full text-xl font-black text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--yellow)] outline-none pb-0.5 focus-visible:ring-2 focus-visible:ring-[#FFE600] font-heading"
                />
              ) : (
                <h1
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingTitle(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingTitle(true); } }}
                  className="text-xl font-black text-[var(--text-primary)] cursor-text hover:bg-[var(--surface-hover)] rounded px-1 -mx-1 py-0.5 transition-colors truncate focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                  title="Click to edit"
                  aria-label={`Task title: ${title}. Press Enter to edit.`}
                >
                  {title}
                </h1>
              )}

              {/* Meta row: priority + column badges */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* Priority dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowPriorityMenu((p) => !p);
                      setShowColumnMenu(false);
                      setShowLabelMenu(false);
                    }}
                    aria-label={`Priority: ${pCfg.label}. Click to change.`}
                    aria-expanded={showPriorityMenu}
                    aria-haspopup="menu"
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                    style={{
                      backgroundColor: pCfg.bg,
                      borderColor: pCfg.color + "40",
                      color: pCfg.color,
                      }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: pCfg.color }}
                    />
                    {pCfg.label}
                    <ChevronDown size={10} />
                  </button>
                  {showPriorityMenu && (
                    <DropdownMenu onClose={() => setShowPriorityMenu(false)}>
                      {PRIORITIES.map((p) => {
                        const cfg = PRIORITY_CONFIG[p];
                        return (
                          <button
                            key={p}
                            onClick={() => changePriority(p)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors text-left focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cfg.color }}
                            />
                            {cfg.label}
                            {priority === p && (
                              <Check size={12} className="ml-auto text-[var(--text-secondary)]" />
                            )}
                          </button>
                        );
                      })}
                    </DropdownMenu>
                  )}
                </div>

                {/* Column / status dropdown */}
                {board && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowColumnMenu((p) => !p);
                        setShowPriorityMenu(false);
                        setShowLabelMenu(false);
                      }}
                      aria-label={`Status: ${col?.title || "Status"}. Click to change.`}
                      aria-expanded={showColumnMenu}
                      aria-haspopup="menu"
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                    >
                      {col && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                      )}
                      {col?.title || "Status"}
                      <ChevronDown size={10} />
                    </button>
                    {showColumnMenu && (
                      <DropdownMenu onClose={() => setShowColumnMenu(false)}>
                        {board.columns
                          .slice()
                          .sort((a, b) => a.position - b.position)
                          .map((c) => (
                            <button
                              key={c.id}
                              onClick={() => changeColumn(c.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors text-left focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: c.color }}
                              />
                              {c.title}
                              {columnId === c.id && (
                                <Check
                                  size={12}
                                  className="ml-auto text-[var(--text-secondary)]"
                                />
                              )}
                            </button>
                          ))}
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Close button */}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Close task details"
              className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[#FFE600]/20 hover:border-[var(--border-strong)] transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
            >
              <X size={14} aria-hidden="true" />
            </motion.button>
          </div>
        </div>

        {/* ────────── BODY ────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* ── Source badge ── */}
            {task.source && task.source.type !== "manual" && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border border-[#FFE600]/40 bg-[#FFE600]/10 text-[#B8A200]">
                  {task.source.type === "ai" && <><Bot size={10} /> Created by AI</>}
                  {task.source.type === "meeting-mom" && <><Video size={10} /> From meeting</>}
                  {task.source.type === "email" && <><Mail size={10} /> From email</>}
                  {task.source.type === "chat" && <><MessageSquare size={10} /> From chat</>}
                </span>
              </div>
            )}

            {/* ── Metadata grid ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Assignee */}
              <MetaField icon={<User size={13} />} label="Assignee">
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowAssigneeMenu((p) => !p);
                      setShowPriorityMenu(false);
                      setShowColumnMenu(false);
                      setShowLabelMenu(false);
                    }}
                    className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none rounded"
                  >
                    {assigneeId ? (
                      (() => {
                        const member = boardMembers.find((m) => m._id === assigneeId);
                        return member ? (
                          <span className="flex items-center gap-1.5">
                            {member.avatarUrl ? (
                              <img src={member.avatarUrl} alt="" className="h-4 w-4 rounded-full border border-[var(--border)]" />
                            ) : (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FFE600] text-[8px] font-bold border border-[var(--border-strong)]">
                                {member.name[0]}
                              </span>
                            )}
                            {member.displayName || member.name}
                          </span>
                        ) : (
                          <span>{assigneeId.slice(0, 8)}…</span>
                        );
                      })()
                    ) : (
                      <span className="italic text-[var(--text-secondary)]/50">Assign...</span>
                    )}
                    <ChevronDown size={10} />
                  </button>
                  {showAssigneeMenu && (
                    <DropdownMenu onClose={() => setShowAssigneeMenu(false)}>
                      <button
                        onClick={() => changeAssignee(null)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors text-left font-heading"
                      >
                        <span className="h-5 w-5 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                          <X size={10} />
                        </span>
                        Unassigned
                        {!assigneeId && <Check size={12} className="ml-auto text-[var(--text-secondary)]" />}
                      </button>
                      {boardMembers.map((member) => (
                        <button
                          key={member._id}
                          onClick={() => changeAssignee(member._id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors text-left font-heading"
                        >
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt="" className="h-5 w-5 rounded-full border border-[var(--border)] flex-shrink-0" />
                          ) : (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FFE600] text-[9px] font-bold border border-[var(--border-strong)] flex-shrink-0">
                              {member.name[0]}
                            </span>
                          )}
                          {member.displayName || member.name}
                          {assigneeId === member._id && <Check size={12} className="ml-auto text-[var(--text-secondary)]" />}
                        </button>
                      ))}
                    </DropdownMenu>
                  )}
                </div>
              </MetaField>

              {/* Due date */}
              <MetaField icon={<Calendar size={13} />} label="Due date">
                <input
                  type="date"
                  value={dueDate ? dueDate.split("T")[0] : ""}
                  onChange={(e) => changeDueDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
                  className="text-xs text-[var(--text-secondary)] font-medium bg-transparent outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] rounded font-heading"
                />
              </MetaField>

              {/* Start date */}
              <MetaField icon={<CalendarRange size={13} />} label="Start date">
                <input
                  type="date"
                  value={startDate ? startDate.split("T")[0] : ""}
                  onChange={(e) => changeStartDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
                  className="text-xs text-[var(--text-secondary)] font-medium bg-transparent outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] rounded font-heading"
                />
              </MetaField>

              {/* Estimate points */}
              <MetaField icon={<Hash size={13} />} label="Estimate">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={estimatePoints ?? ""}
                  onChange={(e) => changeEstimate(e.target.value)}
                  placeholder="Points..."
                  className="text-xs text-[var(--text-secondary)] font-medium bg-transparent outline-none w-16 focus-visible:ring-2 focus-visible:ring-[#FFE600] rounded font-heading placeholder:text-[var(--text-secondary)]/40 placeholder:italic"
                />
              </MetaField>

              {/* Labels */}
              <MetaField icon={<Tag size={13} />} label="Labels">
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowLabelMenu((p) => !p);
                      setShowPriorityMenu(false);
                      setShowColumnMenu(false);
                      setShowAssigneeMenu(false);
                    }}
                    className="flex items-center gap-1 text-xs text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none rounded"
                  >
                    {selectedLabels.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {selectedLabels.map((lid) => {
                          const lbl = board?.labels.find((l) => l.id === lid);
                          if (!lbl) return null;
                          return (
                            <span
                              key={lid}
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold border"
                              style={{
                                backgroundColor: lbl.color + "20",
                                borderColor: lbl.color + "40",
                                color: lbl.color,
                                }}
                            >
                              {lbl.name}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="italic text-[var(--text-secondary)]/50">Add labels...</span>
                    )}
                    <ChevronDown size={10} />
                  </button>
                  {showLabelMenu && board && (
                    <DropdownMenu onClose={() => setShowLabelMenu(false)}>
                      {board.labels.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                          No labels defined
                        </div>
                      ) : (
                        board.labels.map((lbl) => (
                          <button
                            key={lbl.id}
                            onClick={() => toggleLabel(lbl.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-hover)] transition-colors text-left focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: lbl.color }}
                            />
                            {lbl.name}
                            {selectedLabels.includes(lbl.id) && (
                              <Check size={12} className="ml-auto text-[var(--text-secondary)]" />
                            )}
                          </button>
                        ))
                      )}
                    </DropdownMenu>
                  )}
                </div>
              </MetaField>

              {/* Created */}
              <MetaField icon={<Clock size={13} />} label="Created">
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  {createdStr}
                </span>
              </MetaField>
            </div>

            {/* ── Linked Documents ── */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-wider font-heading">
                  Linked Documents
                </h3>
                <button
                  onClick={() => setShowAddDoc((p) => !p)}
                  className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 font-heading"
                >
                  <Plus size={10} /> Add
                </button>
              </div>

              {showAddDoc && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-2 space-y-1.5"
                >
                  <input
                    value={newDocUrl}
                    onChange={(e) => setNewDocUrl(e.target.value)}
                    placeholder="Paste document URL..."
                    className="w-full rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs outline-none focus:border-[var(--border-strong)] transition-colors placeholder:text-[var(--text-secondary)]/40"
                  />
                  <div className="flex gap-1.5">
                    <input
                      value={newDocTitle}
                      onChange={(e) => setNewDocTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="flex-1 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs outline-none focus:border-[var(--border-strong)] transition-colors placeholder:text-[var(--text-secondary)]/40"
                      onKeyDown={(e) => { if (e.key === "Enter") addLinkedDoc(); }}
                    />
                    <button
                      onClick={addLinkedDoc}
                      disabled={!newDocUrl.trim()}
                      className="rounded-lg bg-[#FFE600] text-[#0A0A0A] px-3 py-1.5 text-xs font-bold border-2 border-[var(--border-strong)] shadow-[1px_1px_0_var(--border-strong)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-40 font-heading"
                    >
                      Add
                    </button>
                  </div>
                </motion.div>
              )}

              {linkedDocs.length === 0 && !showAddDoc ? (
                <p className="text-[10px] text-[var(--text-secondary)]/50 italic">No linked documents</p>
              ) : (
                <div className="space-y-1">
                  {linkedDocs.map((doc, i) => (
                    <div key={doc.googleDocId + i} className="flex items-center gap-2 group rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                      <DocTypeIcon type={doc.type} />
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-xs font-medium text-[var(--text-primary)] hover:text-[#3B82F6] truncate transition-colors"
                      >
                        {doc.title}
                      </a>
                      <ExternalLink size={10} className="text-[var(--text-secondary)] flex-shrink-0" />
                      <button
                        onClick={() => removeLinkedDoc(i)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[#EF4444] transition-all flex-shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Linked Emails ── */}
            {linkedEmails.length > 0 && (
              <section>
                <h3 className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-heading">
                  Linked Emails
                </h3>
                <div className="space-y-1">
                  {linkedEmails.map((email, i) => (
                    <div key={email.gmailId + i} className="flex items-center gap-2 group rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                      <Mail size={12} className="text-[var(--text-secondary)] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)] truncate">{email.subject}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate">from {email.from}</p>
                      </div>
                      <button
                        onClick={() => removeLinkedEmail(i)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[#EF4444] transition-all flex-shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Related Meeting ── */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-wider font-heading">
                  Related Meeting
                </h3>
                {!meetingId && !showMeetingSearch && (
                  <button
                    onClick={() => setShowMeetingSearch(true)}
                    className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-heading flex items-center gap-1"
                  >
                    <Plus size={10} /> Link
                  </button>
                )}
              </div>

              {meetingLoading ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 animate-pulse">
                  <div className="h-3 w-32 bg-[var(--border)] rounded" />
                </div>
              ) : meetingData ? (
                <div className="flex items-center gap-2 group rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 hover:border-[var(--border-strong)] transition-colors">
                  <Video size={14} className="text-[#7C3AED] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={meetingData.code ? `/meeting/${meetingData.code}` : "#"}
                      className="text-xs font-bold text-[var(--text-primary)] hover:text-[#7C3AED] transition-colors truncate block font-heading"
                      title={meetingData.title}
                    >
                      {meetingData.title}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      {meetingData.scheduledAt && (
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          {new Date(meetingData.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full font-heading ${
                        meetingData.status === "ended"
                          ? "bg-[#22C55E]/10 text-[#22C55E]"
                          : meetingData.status === "active"
                          ? "bg-[#7C3AED]/10 text-[#7C3AED]"
                          : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
                      }`}>
                        {meetingData.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {meetingData.code && (
                      <a
                        href={`/meeting/${meetingData.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--text-secondary)] hover:text-[#7C3AED] transition-colors"
                        title="Open meeting"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button
                      onClick={unlinkMeeting}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[#EF4444] transition-all"
                      title="Unlink meeting"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : !showMeetingSearch ? (
                <button
                  onClick={() => setShowMeetingSearch(true)}
                  className="w-full rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors text-center font-body"
                >
                  Link a meeting…
                </button>
              ) : null}

              {/* Meeting search */}
              {showMeetingSearch && (
                <div className="rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] p-2 space-y-2">
                  <input
                    type="text"
                    value={meetingSearchQuery}
                    onChange={(e) => searchMeetings(e.target.value)}
                    placeholder="Search meetings by title…"
                    autoFocus
                    className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] px-2 py-1.5 rounded border border-[var(--border)] focus-visible:ring-2 focus-visible:ring-[#FFE600] font-body"
                  />
                  {meetingSearching && (
                    <p className="text-[10px] text-[var(--text-secondary)] px-2 font-body">Searching…</p>
                  )}
                  {meetingSearchResults.length > 0 && (
                    <div className="max-h-[180px] overflow-y-auto space-y-1">
                      {meetingSearchResults.map((m) => (
                        <button
                          key={m._id}
                          onClick={() => linkMeeting(m._id, m)}
                          className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface-hover)] transition-colors"
                        >
                          <Video size={12} className="text-[#7C3AED] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--text-primary)] truncate">{m.title}</p>
                            <div className="flex items-center gap-1.5">
                              {m.scheduledAt && (
                                <span className="text-[10px] text-[var(--text-secondary)]">
                                  {new Date(m.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                              <span className={`text-[9px] font-bold uppercase font-heading ${
                                m.status === "ended" ? "text-[#22C55E]" : m.status === "active" ? "text-[#7C3AED]" : "text-[var(--text-secondary)]"
                              }`}>
                                {m.status}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {meetingSearchQuery.trim().length >= 2 && !meetingSearching && meetingSearchResults.length === 0 && (
                    <p className="text-[10px] text-[var(--text-secondary)] px-2 font-body">No meetings found</p>
                  )}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => { setShowMeetingSearch(false); setMeetingSearchQuery(""); setMeetingSearchResults([]); }}
                      className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-full transition-colors font-heading"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Description ── */}
            <section>
              <h3
                className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-heading"
              >
                Description
              </h3>
              {editingDesc ? (
                <textarea
                  ref={descRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={saveDescription}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDescription(task.description || "");
                      setEditingDesc(false);
                    }
                  }}
                  rows={4}
                  className="w-full rounded-lg border-2 border-[var(--yellow)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none resize-y min-h-[80px] focus-visible:ring-2 focus-visible:ring-[#FFE600]"
                  placeholder="Add a description..."
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingDesc(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingDesc(true); } }}
                  aria-label={description ? "Edit description" : "Add a description"}
                  className="w-full rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm min-h-[60px] cursor-text hover:border-[var(--border-strong)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                >
                  {description ? (
                    <p className="text-[var(--text-primary)] whitespace-pre-wrap">{description}</p>
                  ) : (
                    <p className="text-[var(--text-secondary)]/50 italic">Add a description...</p>
                  )}
                </div>
              )}
            </section>

            {/* ── Subtasks ── */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3
                  className="text-[11px] font-black text-[var(--text-secondary)] uppercase tracking-wider font-heading"
                >
                  Subtasks
                </h3>
                {subtasks.length > 0 && (
                  <span
                    className="text-[10px] font-bold text-[var(--text-secondary)] font-heading"
                  >
                    {doneCount}/{subtasks.length} ({subtaskPercent}%)
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {subtasks.length > 0 && (
                <div className="h-1.5 w-full rounded-full bg-[var(--border)] mb-3 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: subtaskPercent === 100 ? "#22C55E" : "#7C3AED" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${subtaskPercent}%` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                </div>
              )}

              {/* Subtask list */}
              <div className="space-y-1">
                <AnimatePresence initial={false}>
                  {subtasks.map((st) => (
                    <motion.div
                      key={st.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 group"
                    >
                      <button
                        onClick={() => toggleSubtask(st.id)}
                        aria-label={`Mark subtask "${st.title}" as ${st.done ? "incomplete" : "complete"}`}
                        className="flex-shrink-0 text-[var(--text-secondary)] hover:text-[#7C3AED] transition-colors rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                      >
                        {st.done ? (
                          <CheckCircle2 size={16} className="text-[#22C55E]" aria-hidden="true" />
                        ) : (
                          <Circle size={16} aria-hidden="true" />
                        )}
                      </button>
                      <span
                        className={`flex-1 text-sm ${
                          st.done
                            ? "line-through text-[var(--text-secondary)]/50"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {st.title}
                      </span>
                      <button
                        onClick={() => removeSubtask(st.id)}
                        aria-label={`Remove subtask "${st.title}"`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--text-secondary)] hover:text-[#EF4444] transition-all flex-shrink-0 rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Add subtask input */}
              <div className="flex items-center gap-2 mt-2">
                <Plus size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                <input
                  ref={subtaskInputRef}
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSubtask();
                  }}
                  placeholder="Add subtask..."
                  className="flex-1 text-sm bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40 focus-visible:ring-2 focus-visible:ring-[#FFE600] rounded"
                />
                {newSubtask.trim() && (
                  <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    onClick={addSubtask}
                    aria-label="Add subtask"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C3AED] text-white focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </motion.button>
                )}
              </div>
            </section>

            {/* ── Comments / Activity tabs ── */}
            <section>
              <div className="flex items-center gap-1 mb-3 border-b-2 border-[var(--border)]">
                {(["comments", "activity"] as DetailTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
                      tab === t
                        ? "border-[var(--border-strong)] text-[var(--text-primary)]"
                        : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    } font-heading`}
                  >
                    {t === "comments" ? <MessageSquare size={12} /> : <Activity size={12} />}
                    {t === "comments" ? "Comments" : "Activity"}
                  </button>
                ))}
              </div>

              {(() => {
                const filtered = comments.filter((c) =>
                  tab === "comments" ? c.type === "comment" : c.type === "activity"
                );
                return (
                  <div>
                    {commentsError && (
                      <div className="flex items-center gap-2 text-xs text-[#EF4444] bg-[#EF4444]/5 rounded-lg px-3 py-2 mb-2">
                        <AlertTriangle size={12} className="flex-shrink-0" />
                        <span>{commentsError}</span>
                        <button onClick={fetchComments} className="ml-auto font-bold hover:underline rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading">Retry</button>
                      </div>
                    )}
                    {commentsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : filtered.length === 0 && !commentsError ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        {tab === "comments" ? (
                          <>
                            <MessageSquare size={28} className="text-[var(--text-secondary)]/30 mb-2" />
                            <p className="text-xs text-[var(--text-secondary)]">No comments yet</p>
                            <p className="text-[10px] text-[var(--text-secondary)]/60 mt-0.5">Be the first to leave a comment</p>
                          </>
                        ) : (
                          <>
                            <Activity size={28} className="text-[var(--text-secondary)]/30 mb-2" />
                            <p className="text-xs text-[var(--text-secondary)]">No activity yet</p>
                            <p className="text-[10px] text-[var(--text-secondary)]/60 mt-0.5">Changes to this task will appear here</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[200px] overflow-y-auto">
                        {filtered.map((c) => (
                          <div key={c._id} className="flex items-start gap-2">
                            <div className="h-6 w-6 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 mt-0.5">
                              {c.type === "activity" ? <Activity size={10} /> : <User size={10} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-[var(--text-primary)]">{c.content}</p>
                              <p className="text-[10px] text-[var(--text-secondary)]/60 mt-0.5">
                                {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                                {new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comment input (only on comments tab) */}
                    {tab === "comments" && (
                      <div className="flex items-start gap-2 mt-3">
                        <div className="h-7 w-7 rounded-full bg-[var(--yellow)] border-[1.5px] border-[var(--border-strong)] flex items-center justify-center flex-shrink-0 shadow-[1px_1px_0_var(--border-strong)]">
                          <User size={12} />
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            aria-label="Write a comment"
                            className="flex-1 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs outline-none focus:border-[var(--border-strong)] transition-colors placeholder:text-[var(--text-secondary)]/40 focus-visible:ring-2 focus-visible:ring-[#FFE600]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && commentText.trim()) {
                                submitComment();
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          </div>

          {/* ────────── FOOTER: Delete ────────── */}
          <div className="px-6 py-4 border-t-2 border-[var(--border)]">
            {showDeleteConfirm ? (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3"
              >
                <AlertTriangle size={16} className="text-[#EF4444] flex-shrink-0" />
                <span className="text-xs text-[var(--text-primary)] font-medium flex-1">
                  Delete this task permanently?
                </span>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-bold text-white bg-[#EF4444] hover:bg-[#DC2626] px-3 py-1.5 rounded-lg border-2 border-[#EF4444] shadow-[2px_2px_0_var(--border-strong)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </motion.div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-xs font-bold text-[#EF4444]/70 hover:text-[#EF4444] transition-colors rounded focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
              >
                <Trash2 size={13} />
                Delete task
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────────────────────── */

function detectDocType(url: string): LinkedDoc["type"] {
  if (/docs\.google\.com\/document/.test(url)) return "doc";
  if (/docs\.google\.com\/spreadsheets/.test(url)) return "sheet";
  if (/docs\.google\.com\/presentation/.test(url)) return "slide";
  if (/\.pdf($|\?)/.test(url)) return "pdf";
  return "file";
}

function DocTypeIcon({ type }: { type: LinkedDoc["type"] }) {
  const iconMap = {
    doc: <FileText size={12} className="text-[#4285F4]" />,
    sheet: <Hash size={12} className="text-[#0F9D58]" />,
    slide: <FileText size={12} className="text-[#F4B400]" />,
    pdf: <FileText size={12} className="text-[#EF4444]" />,
    file: <Link2 size={12} className="text-[var(--text-secondary)]" />,
  };
  return <span className="flex-shrink-0">{iconMap[type]}</span>;
}

function MetaField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <span className="text-[var(--text-secondary)]">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span
          className="text-[9px] font-black text-[var(--text-secondary)] uppercase tracking-wider font-heading"
        >
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

function DropdownMenu({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, y: -4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] py-1 shadow-[3px_3px_0_var(--border-strong)]"
    >
      {children}
    </motion.div>
  );
}

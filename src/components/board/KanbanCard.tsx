"use client";

import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardTask, BoardLabel } from "@/hooks/useBoard";

/* ─── Priority colors ─── */
const PRIORITY_COLORS: Record<BoardTask["priority"], string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#FFE600",
  low: "#3B82F6",
  none: "#6B7280",
};

const PRIORITY_LABELS: Record<BoardTask["priority"], string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

/* ─── Source icons ─── */
const SOURCE_LABELS: Record<string, string> = {
  ai: "AI",
  "meeting-mom": "Meeting",
  email: "Email",
  chat: "Chat",
};

/* ─── Helpers ─── */
function getDueDateStatus(dueDate?: string): "overdue" | "today" | "normal" | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay < today) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "today";
  return "normal";
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dueDay.getTime() === today.getTime()) return "Today";
  if (dueDay.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ─── Props ─── */
interface KanbanCardProps {
  task: BoardTask;
  onClick?: (task: BoardTask) => void;
  isDragOverlay?: boolean;
  boardLabels?: BoardLabel[];
  boardMembers?: { _id: string; name: string; displayName?: string; avatarUrl?: string }[];
}

/* ─── Component ─── */
export default function KanbanCard({ task, onClick, isDragOverlay, boardLabels = [], boardMembers = [] }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, data: { type: "task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priorityColor = PRIORITY_COLORS[task.priority];
  const dueStatus = getDueDateStatus(task.dueDate);

  const doneSubtasks = task.subtasks.filter((s) => s.done).length;
  const totalSubtasks = task.subtasks.length;
  const subtaskProgress = totalSubtasks > 0 ? doneSubtasks / totalSubtasks : 0;

  const assignee = task.assigneeId ? boardMembers.find((m) => m._id === task.assigneeId) : null;
  const linkedDocCount = (task.linkedDocs?.length || 0) + (task.linkedEmails?.length || 0);

  const cardContent = (
    <div className="space-y-2">
      {/* Labels row (colored pills) */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.slice(0, 4).map((lid) => {
            const lbl = boardLabels.find((l) => l.id === lid);
            if (!lbl) return null;
            return (
              <span
                key={lid}
                className="rounded-full px-1.5 py-px text-[8px] font-bold border leading-tight"
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
          {task.labels.length > 4 && (
            <span className="text-[8px] font-bold text-[var(--text-muted)] leading-tight px-1">
              +{task.labels.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Title + Priority */}
      <div className="flex items-start gap-2">
        {/* Priority dot */}
        <span
          className="mt-1 flex-shrink-0 h-2.5 w-2.5 rounded-full border border-black/10"
          style={{ backgroundColor: priorityColor }}
          title={PRIORITY_LABELS[task.priority]}
          aria-label={`Priority: ${PRIORITY_LABELS[task.priority]}`}
          role="img"
        />
        <p
          className="flex-1 text-[12px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 font-body"
        >
          {task.title}
        </p>
      </div>

      {/* Description preview */}
      {task.description && (
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-2 pl-[18px]">
          {task.description}
        </p>
      )}

      {/* Bottom row: badges */}
      <div className="flex items-center gap-1.5 pl-[18px] flex-wrap">
        {/* Due date badge */}
        {task.dueDate && dueStatus && (
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
              dueStatus === "overdue"
                ? "text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30"
                : dueStatus === "today"
                  ? "text-[#F97316] bg-[#F97316]/10 border border-[#F97316]/30"
                  : "text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)]"
            } font-heading`}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formatDueDate(task.dueDate)}
          </span>
        )}

        {/* Subtask progress */}
        {totalSubtasks > 0 && (
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 border ${
              subtaskProgress === 1
                ? "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30"
                : "text-[var(--text-muted)] bg-[var(--surface-hover)] border-[var(--border)]"
            } font-heading`}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {doneSubtasks}/{totalSubtasks}
          </span>
        )}

        {/* Estimate points */}
        {task.estimatePoints != null && task.estimatePoints > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)] rounded-full px-1.5 py-0.5 font-heading">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <line x1="10" y1="3" x2="8" y2="21" />
              <line x1="16" y1="3" x2="14" y2="21" />
            </svg>
            {task.estimatePoints}
          </span>
        )}

        {/* Linked docs/emails count */}
        {linkedDocCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)] rounded-full px-1.5 py-0.5 font-heading">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {linkedDocCount}
          </span>
        )}

        {/* Source badge */}
        {task.source && task.source.type !== "manual" && (
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-[#B8A200] bg-[#FFE600]/10 border border-[#FFE600]/30 rounded-full px-1.5 py-0.5 font-heading">
            ✨ {SOURCE_LABELS[task.source.type] || task.source.type}
          </span>
        )}
      </div>

      {/* Subtask progress bar */}
      {totalSubtasks > 0 && (
        <div className="pl-[18px]">
          <div className="h-1 rounded-full bg-[var(--border)] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                backgroundColor: subtaskProgress === 1 ? "#22C55E" : "#3B82F6",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${subtaskProgress * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>
        </div>
      )}

      {/* Assignee row (bottom) */}
      {assignee && (
        <div className="flex items-center gap-1.5 pl-[18px]">
          {assignee.avatarUrl ? (
            <img src={assignee.avatarUrl} alt="" className="h-4 w-4 rounded-full border border-[var(--border)]" />
          ) : (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FFE600] text-[7px] font-bold border border-[var(--border-strong)]">
              {assignee.name[0]}
            </span>
          )}
          <span className="text-[9px] text-[var(--text-muted)] font-medium truncate">
            {assignee.displayName || assignee.name}
          </span>
        </div>
      )}
    </div>
  );

  if (isDragOverlay) {
    return (
      <div
        className="rounded-lg border-[1.5px] border-[var(--border-strong)] bg-[var(--surface)] p-2.5 shadow-[4px_4px_0_var(--border-strong)] cursor-grabbing"
        style={{ width: "100%", maxWidth: 280 }}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={() => onClick?.(task)}
      aria-label={`Task: ${task.title}, priority: ${PRIORITY_LABELS[task.priority]}${task.dueDate ? `, due: ${formatDueDate(task.dueDate)}` : ""}${assignee ? `, assigned to ${assignee.displayName || assignee.name}` : ""}`}
      className={`rounded-lg border-[1.5px] bg-[var(--surface)] p-2.5 cursor-grab active:cursor-grabbing transition-shadow focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
        isDragging
          ? "border-[var(--border)] shadow-none"
          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)]"
      }`}
    >
      {cardContent}
    </motion.div>
  );
}

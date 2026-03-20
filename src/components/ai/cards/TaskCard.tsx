"use client";

import { CheckSquare, Calendar, AlertCircle, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { TaskCardData, TaskPriority, TaskStatus } from "./types";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  none: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const STATUS_ICONS: Record<TaskStatus, string> = {
  done: "text-green-500",
  "in-progress": "text-blue-500",
  "in-review": "text-purple-500",
  todo: "text-[var(--text-muted)]",
  blocked: "text-red-500",
};

interface TaskCardProps {
  data: TaskCardData;
  onToggle?: (taskId: string) => void;
  compact?: boolean;
}

export default function TaskCard({ data, onToggle, compact }: TaskCardProps) {
  const isDone = data.status === "done";
  const priorityClass = data.priority ? PRIORITY_COLORS[data.priority] : "";
  const statusClass = STATUS_ICONS[data.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2.5 ${
        compact ? "py-1.5" : ""
      }`}
    >
      <button
        onClick={() => onToggle?.(data.id)}
        role="checkbox"
        aria-checked={isDone}
        aria-label={`Mark "${data.title}" as ${isDone ? "incomplete" : "complete"}`}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          isDone
            ? "bg-green-500 border-green-600 text-white"
            : "border-[var(--border-strong)] hover:border-[#FFE600]"
        }`}
      >
        {isDone && <CheckSquare size={12} />}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-medium leading-snug ${
            isDone ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
          } font-body`}
        >
          {data.title}
        </p>

        {!compact && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {data.priority && (
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${priorityClass}`}>
                {data.priority}
              </span>
            )}
            {data.dueDate && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Calendar size={9} />
                {new Date(data.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {data.assignee && (
              <span className="text-[10px] text-[var(--text-secondary)]">
                {data.assignee.name}
              </span>
            )}
            {data.status && data.status !== "done" && (
              <span className={`flex items-center gap-0.5 text-[10px] capitalize ${statusClass}`}>
                <AlertCircle size={9} />
                {data.status.replace("-", " ")}
              </span>
            )}
          </div>
        )}
      </div>

      {data.boardId && (
        <Link
          href={`/boards/${data.boardId}?task=${data.id}`}
          className="mt-0.5 shrink-0 text-[var(--text-muted)] hover:text-[#FFE600] transition-colors"
          title="Open in board"
        >
          <ArrowUpRight size={12} />
        </Link>
      )}
    </motion.div>
  );
}

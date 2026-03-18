"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, ChevronRight, AlertCircle } from "lucide-react";
import { useBoard, type BoardTask, type Board } from "@/hooks/useBoard";
import KanbanBoard from "@/components/board/KanbanBoard";
import TaskDetail from "@/components/board/TaskDetail";
import type { PendingAction } from "@/hooks/usePendingActions";

/* ─── Priority colors ─── */
const PRIORITY_DOT: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#FFE600",
  low: "#3B82F6",
  none: "#6B7280",
};

/* ─── ActionCard (preserved from TasksPanel) ─── */
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="rounded-xl border-[1.5px] border-[#FFE600]/40 bg-[#FFE600]/5 p-3"
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-sm">✨</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            AI Suggestion
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
            {action.summary || action.actionType.replace(/_/g, " ")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-[#22C55E] text-white text-[10px] font-bold py-1.5"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Accept
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onDeny}
          className="flex-1 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] text-[10px] font-bold py-1.5 border border-[var(--border)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Deny
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowEdit(!showEdit)}
          className="rounded-lg bg-[var(--surface-hover)] text-[var(--text-muted)] text-[10px] font-bold py-1.5 px-2 border border-[var(--border)]"
        >
          ✏️
        </motion.button>
      </div>
      <AnimatePresence>
        {showEdit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Suggest a change..."
                className="flex-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 outline-none focus:border-[#FFE600]"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  if (editText.trim()) {
                    onRevise(editText.trim());
                    setEditText("");
                    setShowEdit(false);
                  }
                }}
                className="text-[10px] font-bold text-[#FFE600] px-2 py-1.5"
              >
                Send
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Compact task item for dashboard ─── */
function CompactTaskItem({
  task,
  onClick,
}: {
  task: BoardTask;
  onClick: () => void;
}) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completedAt;
  const isToday = task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();
  const subtasksDone = task.subtasks?.filter((s) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-left group"
    >
      {/* Priority dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: PRIORITY_DOT[task.priority] || "#6B7280" }}
      />

      {/* Title */}
      <span className="flex-1 text-xs text-[var(--text-primary)] truncate font-medium">
        {task.title}
      </span>

      {/* Subtask count */}
      {subtasksTotal > 0 && (
        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
          {subtasksDone}/{subtasksTotal}
        </span>
      )}

      {/* Due date */}
      {task.dueDate && (
        <span
          className={`text-[10px] flex-shrink-0 font-medium ${
            isOverdue ? "text-[#EF4444]" : isToday ? "text-[#F97316]" : "text-[var(--text-muted)]"
          }`}
        >
          {isOverdue && <AlertCircle className="inline w-3 h-3 mr-0.5" />}
          {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}

      <ChevronRight className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </motion.button>
  );
}

/* ─── Main Panel ─── */
interface TasksBoardPanelProps {
  pendingActions?: PendingAction[];
  onConfirmAction?: (actionId: string) => void;
  onDenyAction?: (actionId: string) => void;
  onReviseAction?: (actionId: string, feedback: string) => void;
}

export default function TasksBoardPanel({
  pendingActions = [],
  onConfirmAction,
  onDenyAction,
  onReviseAction,
}: TasksBoardPanelProps) {
  const [personalBoardId, setPersonalBoardId] = useState<string | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);

  const [boardError, setBoardError] = useState<string | null>(null);

  // Fetch or auto-create personal board
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/boards", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setBoardError("Failed to load tasks board");
          return;
        }
        const json = await res.json();
        const personal = json.data?.find((b: Board & { scope?: string }) => b.scope === "personal");
        if (personal) {
          if (!cancelled) setPersonalBoardId(personal._id);
        } else {
          // Auto-create personal board
          const createRes = await fetch("/api/boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ title: "My Tasks", scope: "personal" }),
          });
          if (createRes.ok) {
            const createJson = await createRes.json();
            if (!cancelled) setPersonalBoardId(createJson.data._id);
          } else {
            if (!cancelled) setBoardError("Failed to create tasks board");
          }
        }
      } catch {
        if (!cancelled) setBoardError("Failed to load tasks board");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { board, tasks, loading, updateTask, deleteTask } = useBoard(personalBoardId || undefined);

  // Get incomplete tasks sorted by due date
  const myTasks = tasks
    .filter((t) => !t.completedAt)
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    })
    .slice(0, 8);

  const overdueCount = myTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date(),
  ).length;

  const handleTaskClick = useCallback((task: BoardTask) => {
    setSelectedTask(task);
  }, []);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22C55E]/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              My Tasks
            </span>
            {myTasks.length > 0 && (
              <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--surface-hover)] px-1.5 py-0.5 rounded-full">
                {myTasks.length}
              </span>
            )}
            {overdueCount > 0 && (
              <span className="text-[10px] font-bold text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded-full">
                {overdueCount} overdue
              </span>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowBoard(true)}
            className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--surface-hover)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <LayoutGrid className="w-3 h-3" />
            Board
          </motion.button>
        </div>

        {/* AI Pending Actions */}
        {pendingActions.length > 0 && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-px bg-[#FFE600]/30" />
              <span className="text-[10px] font-bold text-[#B8860B]" style={{ fontFamily: "var(--font-heading)" }}>
                AI Actions
              </span>
              <div className="flex-1 h-px bg-[#FFE600]/30" />
            </div>
            <AnimatePresence>
              {pendingActions.map((action) => (
                <ActionCard
                  key={action.actionId}
                  action={action}
                  onConfirm={() => onConfirmAction?.(action.actionId)}
                  onDeny={() => onDenyAction?.(action.actionId)}
                  onRevise={(fb) => onReviseAction?.(action.actionId, fb)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Board error */}
        {boardError && (
          <div className="text-xs text-[#EF4444] bg-[#EF4444]/5 rounded-lg px-3 py-2 mb-2">
            {boardError}
          </div>
        )}

        {/* Compact task list */}
        <div className="flex-1 space-y-0.5">
          {loading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
              ))}
            </div>
          ) : myTasks.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--text-muted)]">No tasks yet</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowBoard(true)}
                className="text-xs font-bold text-[#7C3AED] mt-2 hover:underline"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Open board to add tasks →
              </motion.button>
            </div>
          ) : (
            myTasks.map((task) => (
              <CompactTaskItem
                key={task._id}
                task={task}
                onClick={() => handleTaskClick(task)}
              />
            ))
          )}
        </div>
      </div>

      {/* Full-screen Kanban Board overlay */}
      <AnimatePresence>
        {showBoard && personalBoardId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-[var(--background)]"
          >
            <KanbanBoard
              boardId={personalBoardId}
              isFullscreen
              onClose={() => setShowBoard(false)}
              onTaskClick={handleTaskClick}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Detail drawer */}
      <TaskDetail
        task={selectedTask}
        board={board}
        onClose={() => setSelectedTask(null)}
        onUpdate={updateTask}
        onDelete={async (taskId) => {
          await deleteTask(taskId);
          setSelectedTask(null);
        }}
      />
    </>
  );
}

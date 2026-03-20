"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import KanbanCard from "./KanbanCard";
import type { BoardColumn, BoardTask, BoardLabel, BoardMember } from "@/hooks/useBoard";

/* ─── Props ─── */
interface KanbanColumnProps {
  column: BoardColumn;
  tasks: BoardTask[];
  onCreateTask: (data: { title: string; columnId: string; priority?: string }) => Promise<BoardTask | undefined>;
  onTaskClick?: (task: BoardTask) => void;
  boardLabels?: BoardLabel[];
  boardMembers?: BoardMember[];
}

/* ─── Component ─── */
export default function KanbanColumn({ column, tasks, onCreateTask, onTaskClick, boardLabels = [], boardMembers = [] }: KanbanColumnProps) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "column", column },
  });

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.position - b.position),
    [tasks]
  );
  const taskIds = useMemo(() => sortedTasks.map((t) => t._id), [sortedTasks]);

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      await onCreateTask({ title, columnId: column.id });
      setNewTaskTitle("");
      setShowAddInput(false);
    } catch (err) {
      console.error("[KanbanColumn] Failed to create task:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddTask();
    if (e.key === "Escape") {
      setShowAddInput(false);
      setNewTaskTitle("");
    }
  };

  const isAtWipLimit = column.wipLimit ? tasks.length >= column.wipLimit : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col w-[280px] min-w-[280px] max-w-[280px] shrink-0"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        {/* Color dot */}
        <span
          className="h-3 w-3 rounded-full border border-[var(--border)] flex-shrink-0"
          style={{ backgroundColor: column.color }}
        />
        {/* Title */}
        <h3
          className="text-sm font-bold text-[var(--text-primary)] truncate flex-1 font-heading"
        >
          {column.title}
        </h3>
        {/* Count badge */}
        <span
          className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
            isAtWipLimit
              ? "text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30"
              : "text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)]"
          } font-heading`}
        >
          {tasks.length}
          {column.wipLimit ? `/${column.wipLimit}` : ""}
        </span>
        {/* Add button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAddInput(!showAddInput)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
          title="Add task"
          aria-label={`Add task to ${column.title}`}
          aria-expanded={showAddInput}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.button>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 space-y-2 min-h-[120px] transition-colors duration-200 ${
          isOver
            ? "bg-[var(--surface-hover)] ring-2 ring-[var(--border-strong)] ring-offset-1"
            : "bg-[var(--surface-hover)]/50"
        }`}
        style={{
          backgroundColor: isOver ? undefined : `${column.color}08`,
        }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <AnimatePresence mode="popLayout">
            {sortedTasks.map((task) => (
              <KanbanCard key={task._id} task={task} onClick={onTaskClick} boardLabels={boardLabels} boardMembers={boardMembers} />
            ))}
          </AnimatePresence>
        </SortableContext>

        {/* Empty state */}
        {sortedTasks.length === 0 && !isOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center h-20"
          >
            <p className="text-[11px] text-[var(--text-muted)] font-body">
              No tasks yet
            </p>
          </motion.div>
        )}

        {/* Drop indicator */}
        {isOver && sortedTasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-12 rounded-lg border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface)]/50 flex items-center justify-center"
          >
            <p className="text-[10px] font-bold text-[var(--text-muted)] font-heading">
              Drop here
            </p>
          </motion.div>
        )}
      </div>

      {/* Add task input */}
      <AnimatePresence>
        {showAddInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden mt-2"
          >
            <div className="rounded-lg border-[1.5px] border-[var(--border)] bg-[var(--surface)] p-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Task title..."
                aria-label={`New task title for ${column.title}`}
                autoFocus
                className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] mb-2 focus-visible:ring-2 focus-visible:ring-[#FFE600] rounded font-body"
              />
              <div className="flex items-center justify-between">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setShowAddInput(false);
                    setNewTaskTitle("");
                  }}
                  className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleAddTask}
                  disabled={creating || !newTaskTitle.trim()}
                  className="text-[10px] font-bold text-white bg-[var(--text-primary)] rounded-full px-3 py-1 hover:opacity-80 disabled:opacity-40 transition-opacity focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                >
                  {creating ? "Adding..." : "Add Task"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

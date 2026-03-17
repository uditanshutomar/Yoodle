"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useBoard, type BoardTask } from "@/hooks/useBoard";
import KanbanColumn from "./KanbanColumn";
import KanbanCard from "./KanbanCard";

/* ─── Priority filter options ─── */
const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "Urgent", color: "#EF4444" },
  { value: "high", label: "High", color: "#F97316" },
  { value: "medium", label: "Medium", color: "#FFE600" },
  { value: "low", label: "Low", color: "#3B82F6" },
  { value: "none", label: "None", color: "#6B7280" },
];

/* ─── Props ─── */
interface KanbanBoardProps {
  boardId: string;
  isFullscreen?: boolean;
  onClose?: () => void;
  onTaskClick?: (task: BoardTask) => void;
}

/* ─── Component ─── */
export default function KanbanBoard({
  boardId,
  isFullscreen = false,
  onClose,
  onTaskClick,
}: KanbanBoardProps) {
  const { board, tasks, loading, error, createTask, reorderTasks, setTasks, refetch } =
    useBoard(boardId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  /* ─── Sensors ─── */
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, keyboardSensor);

  /* ─── Filtered tasks ─── */
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
      );
    }
    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    return result;
  }, [tasks, searchQuery, priorityFilter]);

  /* ─── Sorted columns ─── */
  const columns = useMemo(
    () => (board?.columns ?? []).sort((a, b) => a.position - b.position),
    [board]
  );

  /* ─── Tasks by column ─── */
  const tasksByColumn = useMemo(() => {
    const map: Record<string, BoardTask[]> = {};
    for (const col of columns) {
      map[col.id] = filteredTasks.filter((t) => t.columnId === col.id);
    }
    return map;
  }, [columns, filteredTasks]);

  /* ─── Active task for drag overlay ─── */
  const activeTask = useMemo(
    () => (activeId ? tasks.find((t) => t._id === activeId) : null),
    [activeId, tasks]
  );

  /* ─── Find column containing a task ─── */
  const findColumnOfTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t._id === taskId);
      return task?.columnId ?? null;
    },
    [tasks]
  );

  /* ─── DnD Handlers ─── */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeTaskId = String(active.id);
      const overId = String(over.id);

      const activeColumnId = findColumnOfTask(activeTaskId);
      if (!activeColumnId) return;

      // Determine target column
      let overColumnId: string | null = null;

      if (overId.startsWith("column-")) {
        overColumnId = overId.replace("column-", "");
      } else {
        overColumnId = findColumnOfTask(overId);
      }

      if (!overColumnId || activeColumnId === overColumnId) return;

      // Move task to new column (optimistic)
      setTasks((prev) => {
        const updated = prev.map((t) =>
          t._id === activeTaskId ? { ...t, columnId: overColumnId! } : t
        );
        return updated;
      });
    },
    [findColumnOfTask, setTasks]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activeTaskId = String(active.id);
      const overId = String(over.id);

      const activeColumnId = findColumnOfTask(activeTaskId);
      if (!activeColumnId) return;

      let overColumnId: string | null = null;
      if (overId.startsWith("column-")) {
        overColumnId = overId.replace("column-", "");
      } else {
        overColumnId = findColumnOfTask(overId);
      }
      if (!overColumnId) return;

      // Reorder within same column
      if (activeColumnId === overColumnId && !overId.startsWith("column-")) {
        const columnTasks = tasks
          .filter((t) => t.columnId === activeColumnId)
          .sort((a, b) => a.position - b.position);
        const oldIndex = columnTasks.findIndex((t) => t._id === activeTaskId);
        const newIndex = columnTasks.findIndex((t) => t._id === overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(columnTasks, oldIndex, newIndex);
          const updates = reordered.map((t, i) => ({
            taskId: t._id,
            columnId: activeColumnId,
            position: i,
          }));

          // Optimistic update
          setTasks((prev) => {
            const otherTasks = prev.filter((t) => t.columnId !== activeColumnId);
            const updatedColumnTasks = reordered.map((t, i) => ({
              ...t,
              position: i,
            }));
            return [...otherTasks, ...updatedColumnTasks];
          });

          reorderTasks(updates);
        }
      } else {
        // Cross-column move: persist the move
        const targetColumnTasks = tasks
          .filter((t) => t.columnId === overColumnId && t._id !== activeTaskId)
          .sort((a, b) => a.position - b.position);

        let insertIndex = targetColumnTasks.length;
        if (!overId.startsWith("column-")) {
          const overIndex = targetColumnTasks.findIndex((t) => t._id === overId);
          if (overIndex !== -1) insertIndex = overIndex;
        }

        // Insert the moved task
        const movedTask = tasks.find((t) => t._id === activeTaskId);
        if (movedTask) {
          const newColumnTasks = [...targetColumnTasks];
          newColumnTasks.splice(insertIndex, 0, { ...movedTask, columnId: overColumnId });

          const updates = newColumnTasks.map((t, i) => ({
            taskId: t._id,
            columnId: overColumnId!,
            position: i,
          }));

          setTasks((prev) => {
            const otherTasks = prev.filter(
              (t) => t.columnId !== overColumnId && t._id !== activeTaskId
            );
            const updatedColumnTasks = newColumnTasks.map((t, i) => ({
              ...t,
              columnId: overColumnId!,
              position: i,
            }));
            return [...otherTasks, ...updatedColumnTasks];
          });

          reorderTasks(updates);
        }
      }
    },
    [findColumnOfTask, tasks, setTasks, reorderTasks]
  );

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <BoardShell isFullscreen={isFullscreen} onClose={onClose}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-3 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin" />
            <p
              className="text-sm font-bold text-[var(--text-muted)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Loading board...
            </p>
          </div>
        </div>
      </BoardShell>
    );
  }

  /* ─── Error state ─── */
  if (error || !board) {
    return (
      <BoardShell isFullscreen={isFullscreen} onClose={onClose}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-[#EF4444]/10 flex items-center justify-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p
              className="text-sm font-bold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {error || "Board not found"}
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => refetch()}
              className="text-xs font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-4 py-1.5 hover:bg-[#3B82F6]/20 transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Retry
            </motion.button>
          </div>
        </div>
      </BoardShell>
    );
  }

  const hasActiveFilters = searchQuery.trim() !== "" || priorityFilter !== "all";

  return (
    <BoardShell isFullscreen={isFullscreen} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-bold text-[var(--text-primary)] truncate"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {board.title}
          </h1>
          <span
            className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)] rounded-full px-2 py-0.5"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {columns.length} columns
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 px-1 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-lg outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="text-xs text-[var(--text-primary)] bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--border-strong)] transition-colors cursor-pointer appearance-none pr-7"
          style={{
            fontFamily: "var(--font-heading)",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%230A0A0A' stroke-width='2.5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
          }}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Clear filters */}
        <AnimatePresence>
          {hasActiveFilters && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setSearchQuery("");
                setPriorityFilter("all");
              }}
              className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--surface-hover)] border border-[var(--border)] rounded-full px-2.5 py-1 transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Clear filters
            </motion.button>
          )}
        </AnimatePresence>

        {/* Task count */}
        <span
          className="text-[10px] font-bold text-[var(--text-muted)] ml-auto"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          {hasActiveFilters ? " (filtered)" : ""}
        </span>
      </div>

      {/* Board columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-1 min-h-[300px] scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {columns.map((column, index) => (
              <motion.div
                key={column.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                  delay: index * 0.05,
                }}
              >
                <KanbanColumn
                  column={column}
                  tasks={tasksByColumn[column.id] ?? []}
                  onCreateTask={createTask}
                  onTaskClick={onTaskClick}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <KanbanCard task={activeTask} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Empty state */}
      {columns.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center h-48"
        >
          <div className="text-center">
            <div className="h-16 w-16 mx-auto mb-3 rounded-2xl bg-[var(--surface-hover)] border-2 border-[var(--border)] flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <p
              className="text-sm font-bold text-[var(--text-primary)] mb-1"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              No columns yet
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Add columns to start organizing tasks
            </p>
          </div>
        </motion.div>
      )}
    </BoardShell>
  );
}

/* ─── Board Shell ─── */
function BoardShell({
  isFullscreen,
  onClose,
  children,
}: {
  isFullscreen?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  if (isFullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[var(--background)] overflow-auto"
      >
        {/* Fullscreen close button */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--border)]">
          <div />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface)] border-[1.5px] border-[var(--border)] hover:border-[var(--border-strong)] rounded-lg px-3 py-1.5 hover:shadow-[2px_2px_0_var(--border-strong)] transition-all"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close
          </motion.button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </motion.div>
    );
  }

  return <div className="w-full">{children}</div>;
}

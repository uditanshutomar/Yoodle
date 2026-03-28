"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { StickyNote, Plus, RefreshCw } from "lucide-react";

interface BoardTask {
  _id: string;
  title: string;
  status: string;
  priority?: string;
}

interface Board {
  _id: string;
  name: string;
}

export default function StickyBoardWidget() {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchTasks = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // First, fetch user's boards
      const boardsRes = await fetch("/api/boards", {
        credentials: "include",
        signal: controller.signal,
      });
      if (!boardsRes.ok) throw new Error(`Failed (${boardsRes.status})`);
      const boardsJson = await boardsRes.json();
      if (!mountedRef.current) return;

      const boards: Board[] = Array.isArray(boardsJson?.data)
        ? boardsJson.data
        : boardsJson?.data?.boards ?? [];

      if (boards.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Fetch tasks from the first board
      const boardId = boards[0]._id;
      const tasksRes = await fetch(`/api/boards/${boardId}/tasks?limit=6`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!tasksRes.ok) throw new Error(`Failed (${tasksRes.status})`);
      const tasksJson = await tasksRes.json();
      if (!mountedRef.current) return;

      const taskList: BoardTask[] = Array.isArray(tasksJson?.data)
        ? tasksJson.data
        : tasksJson?.data?.tasks ?? [];

      setTasks(taskList);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchTasks();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchTasks]);

  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-8 animate-pulse rounded-lg bg-[var(--surface-hover)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="text-xs text-[#FF6B6B] font-body">{error}</p>
        <button
          onClick={fetchTasks}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[#FFE600] transition-colors font-heading"
        >
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center h-full">
        <StickyNote size={28} className="text-[var(--text-muted)]" aria-hidden="true" />
        <p className="text-sm font-bold text-[var(--text-secondary)] font-heading">
          No tasks yet
        </p>
        <Link
          href="/board"
          className="flex items-center gap-1 text-xs font-bold text-[#FFE600] hover:underline font-heading"
        >
          <Plus size={12} /> Add a task
        </Link>
      </div>
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    todo: "bg-[var(--text-muted)]",
    "in-progress": "bg-[#FFE600]",
    done: "bg-[#22C55E]",
    blocked: "bg-[#FF6B6B]",
  };

  return (
    <div className="space-y-1.5">
      {tasks.map((task) => (
        <Link
          key={task._id}
          href="/board"
          className="group flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 hover:border-[#FFE600] transition-colors"
        >
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${STATUS_COLORS[task.status] ?? "bg-[var(--text-muted)]"}`}
          />
          <span className="text-xs font-bold text-[var(--text-primary)] truncate font-heading">
            {task.title}
          </span>
        </Link>
      ))}
      {tasks.length >= 6 && (
        <Link
          href="/board"
          className="block text-center text-[10px] font-bold text-[var(--text-muted)] hover:text-[#FFE600] transition-colors font-heading pt-1"
        >
          View all tasks
        </Link>
      )}
    </div>
  );
}

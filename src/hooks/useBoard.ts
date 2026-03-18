"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Types ─── */

export interface BoardColumn {
  id: string;
  title: string;
  color: string;
  position: number;
  wipLimit?: number;
}

export interface BoardLabel {
  id: string;
  name: string;
  color: string;
}

export interface BoardTask {
  _id: string;
  boardId: string;
  columnId: string;
  position: number;
  title: string;
  description?: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  assigneeId?: string;
  labels: string[];
  dueDate?: string;
  subtasks: { id: string; title: string; done: boolean }[];
  completedAt?: string;
  createdAt: string;
}

export interface Board {
  _id: string;
  title: string;
  columns: BoardColumn[];
  labels: BoardLabel[];
  members: { userId: string; role: string }[];
}

export function useBoard(boardId?: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, { credentials: "include" });
      if (!res.ok) {
        if (isMountedRef.current) setError("Failed to load board");
        return;
      }
      const json = await res.json();
      if (isMountedRef.current) setBoard(json.data);
    } catch {
      if (isMountedRef.current) setError("Failed to load board");
    }
  }, [boardId]);

  const fetchTasks = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, { credentials: "include" });
      if (!res.ok) {
        if (isMountedRef.current) setError("Failed to load tasks");
        return;
      }
      const json = await res.json();
      if (isMountedRef.current) setTasks(json.data);
    } catch {
      if (isMountedRef.current) setError("Failed to load tasks");
    }
  }, [boardId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await Promise.all([fetchBoard(), fetchTasks()]);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [fetchBoard, fetchTasks]);

  const createTask = useCallback(
    async (data: { title: string; columnId: string; priority?: string }) => {
      if (!boardId) return;
      try {
        const res = await fetch(`/api/boards/${boardId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          if (isMountedRef.current) setError("Failed to create task");
          return;
        }
        const json = await res.json();
        if (isMountedRef.current) setTasks((prev) => [...prev, json.data]);
        return json.data;
      } catch {
        if (isMountedRef.current) setError("Failed to create task");
      }
    },
    [boardId]
  );

  const updateTask = useCallback(
    async (taskId: string, data: Partial<BoardTask>) => {
      if (!boardId) return;
      try {
        const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          if (isMountedRef.current) setError("Failed to update task");
          return;
        }
        const json = await res.json();
        if (isMountedRef.current) {
          setTasks((prev) => prev.map((t) => (t._id === taskId ? json.data : t)));
        }
        return json.data;
      } catch {
        if (isMountedRef.current) setError("Failed to update task");
      }
    },
    [boardId]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!boardId) return;
      // Capture task for rollback before optimistic removal
      let removedTask: BoardTask | undefined;
      setTasks((prev) => {
        removedTask = prev.find((t) => t._id === taskId);
        return prev.filter((t) => t._id !== taskId);
      });
      try {
        const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          // Rollback: re-insert the task
          if (removedTask && isMountedRef.current) {
            setTasks((prev) => [...prev, removedTask!]);
            setError("Failed to delete task");
          }
        }
      } catch {
        // Rollback on network error
        if (removedTask && isMountedRef.current) {
          setTasks((prev) => [...prev, removedTask!]);
          setError("Failed to delete task");
        }
      }
    },
    [boardId]
  );

  const reorderTasks = useCallback(
    async (updates: { taskId: string; columnId: string; position: number }[]) => {
      if (!boardId) return;
      try {
        const res = await fetch(`/api/boards/${boardId}/tasks/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tasks: updates }),
        });
        if (!res.ok && isMountedRef.current) {
          setError("Failed to reorder tasks");
        }
      } catch {
        if (isMountedRef.current) setError("Failed to reorder tasks");
      }
    },
    [boardId]
  );

  return {
    board,
    tasks,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    refetch: () => Promise.all([fetchBoard(), fetchTasks()]),
    setTasks,
  };
}

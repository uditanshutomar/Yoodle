"use client";

import { useState, useEffect, useCallback } from "react";

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

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setBoard(json.data);
      }
    } catch {
      setError("Failed to load board");
    }
  }, [boardId]);

  const fetchTasks = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setTasks(json.data);
      }
    } catch {
      setError("Failed to load tasks");
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
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        setTasks((prev) => [...prev, json.data]);
        return json.data;
      }
    },
    [boardId]
  );

  const updateTask = useCallback(
    async (taskId: string, data: Partial<BoardTask>) => {
      if (!boardId) return;
      const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        setTasks((prev) => prev.map((t) => (t._id === taskId ? json.data : t)));
        return json.data;
      }
    },
    [boardId]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!boardId) return;
      await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setTasks((prev) => prev.filter((t) => t._id !== taskId));
    },
    [boardId]
  );

  const reorderTasks = useCallback(
    async (updates: { taskId: string; columnId: string; position: number }[]) => {
      if (!boardId) return;
      await fetch(`/api/boards/${boardId}/tasks/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tasks: updates }),
      });
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

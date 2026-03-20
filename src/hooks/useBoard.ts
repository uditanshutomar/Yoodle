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

export interface LinkedDoc {
  googleDocId: string;
  title: string;
  url: string;
  type: "doc" | "sheet" | "slide" | "pdf" | "file";
}

export interface LinkedEmail {
  gmailId: string;
  subject: string;
  from: string;
}

export interface TaskSource {
  type: "manual" | "ai" | "meeting-mom" | "email" | "chat";
  sourceId?: string;
}

export interface BoardTask {
  _id: string;
  boardId: string;
  columnId: string;
  position: number;
  title: string;
  description?: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  creatorId?: string;
  assigneeId?: string;
  collaborators?: string[];
  labels: string[];
  dueDate?: string;
  startDate?: string;
  subtasks: { id: string; title: string; done: boolean; assigneeId?: string }[];
  linkedDocs?: LinkedDoc[];
  linkedEmails?: LinkedEmail[];
  meetingId?: string;
  parentTaskId?: string;
  source?: TaskSource;
  estimatePoints?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Board {
  _id: string;
  title: string;
  columns: BoardColumn[];
  labels: BoardLabel[];
  members: { userId: string; role: string }[];
}

export interface BoardMember {
  _id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
}

export function useBoard(boardId?: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const fetchBoard = useCallback(async (signal?: AbortSignal) => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, { credentials: "include", signal });
      if (!res.ok) {
        if (isMountedRef.current) setError("Failed to load board");
        return;
      }
      const json = await res.json();
      if (isMountedRef.current) {
        setBoard(json.data);
        setError(null);
        // Fetch member profiles if board has members
        const members = json.data?.members || [];
        if (members.length > 0) {
          const memberIds = members.map((m: { userId: string }) => m.userId);
          try {
            const memberRes = await fetch(`/api/users/batch?ids=${memberIds.join(",")}`, {
              credentials: "include",
              signal,
            });
            if (memberRes.ok) {
              const memberJson = await memberRes.json();
              if (isMountedRef.current) setBoardMembers(memberJson.data || []);
            }
          } catch {
            // Non-fatal — members just won't show avatars
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (isMountedRef.current) setError("Failed to load board");
    }
  }, [boardId]);

  const fetchTasks = useCallback(async (signal?: AbortSignal) => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, { credentials: "include", signal });
      if (!res.ok) {
        if (isMountedRef.current) setError("Failed to load tasks");
        return;
      }
      const json = await res.json();
      if (isMountedRef.current) {
        setTasks(json.data);
        setError(null); // Clear previous errors on success
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (isMountedRef.current) setError("Failed to load tasks");
    }
  }, [boardId]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    async function load() {
      await Promise.all([fetchBoard(controller.signal), fetchTasks(controller.signal)]);
      if (!controller.signal.aborted && isMountedRef.current) setLoading(false);
    }
    load();
    return () => {
      controller.abort();
      abortRef.current = null;
    };
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
        if (isMountedRef.current) {
          setTasks((prev) => [...prev, json.data]);
          setError(null);
        }
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
          setError(null);
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
      // Snapshot tasks before optimistic removal for position-accurate rollback
      let snapshot: BoardTask[] = [];
      setTasks((prev) => {
        snapshot = prev;
        return prev.filter((t) => t._id !== taskId);
      });
      try {
        const res = await fetch(`/api/boards/${boardId}/tasks/${taskId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          // Rollback: restore full snapshot to preserve original order
          if (isMountedRef.current) {
            setTasks(snapshot);
            setError("Failed to delete task");
          }
        }
      } catch {
        // Rollback on network error — restore original order
        if (isMountedRef.current) {
          setTasks(snapshot);
          setError("Failed to delete task");
        }
      }
    },
    [boardId]
  );

  const reorderTasks = useCallback(
    async (updates: { taskId: string; columnId: string; position: number }[]) => {
      if (!boardId) return;
      // Snapshot tasks before the API call for rollback on failure.
      // This captures the already-optimistically-updated state, so we
      // refetch from the server instead (which has the true order).
      try {
        const res = await fetch(`/api/boards/${boardId}/tasks/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tasks: updates }),
        });
        if (!res.ok && isMountedRef.current) {
          setError("Failed to reorder tasks");
          // Refetch to restore server-side order after failed optimistic update
          const controller = new AbortController();
          abortRef.current = controller;
          await fetchTasks(controller.signal);
        }
      } catch {
        if (isMountedRef.current) {
          setError("Failed to reorder tasks");
          // Refetch to restore server-side order after failed optimistic update
          const controller = new AbortController();
          abortRef.current = controller;
          await fetchTasks(controller.signal);
        }
      }
    },
    [boardId, fetchTasks]
  );

  const refetch = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return Promise.all([fetchBoard(controller.signal), fetchTasks(controller.signal)]);
  }, [fetchBoard, fetchTasks]);

  return {
    board,
    tasks,
    boardMembers,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
    refetch,
    setTasks,
  };
}

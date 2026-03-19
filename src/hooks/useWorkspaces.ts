"use client";

import { useState, useCallback } from "react";

/* ─── Types ─── */

export interface WorkspaceMember {
  userId: string | { _id: string; name?: string; email?: string; displayName?: string };
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface WorkspaceSettings {
  autoShutdown: boolean;
  shutdownAfterMinutes: number;
}

export interface Workspace {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  _id: string;
  action: string;
  userId: string;
  userName?: string;
  workspaceId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

/* ─── Helpers ─── */

/** Extract a human-readable error message from an API JSON response. */
function extractErrorMessage(json: Record<string, unknown>, fallback: string): string {
  // API error shape: { error: { code, message } } or { error: "string" } or { message: "string" }
  if (json.error && typeof json.error === "object") {
    return (json.error as { message?: string }).message || fallback;
  }
  if (typeof json.error === "string") return json.error;
  if (typeof json.message === "string") return json.message;
  return fallback;
}

/** Safely parse JSON from a response, returning null for non-JSON bodies. */
async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* ─── Hook ─── */

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", { credentials: "include" });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(json ? extractErrorMessage(json, "Failed to fetch workspaces") : `Request failed (${res.status})`);
      }
      // API returns { data: { workspaces: [...] } } via successResponse
      const list = (json?.data as Record<string, unknown>)?.workspaces ?? json?.workspaces ?? [];
      setWorkspaces(list as Workspace[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch workspaces";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, description }),
    });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to create workspace") : `Request failed (${res.status})`);
    }
    await fetchWorkspaces();
    return json?.data;
  }, [fetchWorkspaces]);

  const updateWorkspace = useCallback(async (
    id: string,
    data: { name?: string; description?: string; settings?: Partial<WorkspaceSettings> },
  ) => {
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to update workspace") : `Request failed (${res.status})`);
    }
    await fetchWorkspaces();
    return json?.data;
  }, [fetchWorkspaces]);

  const deleteWorkspace = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to delete workspace") : `Request failed (${res.status})`);
    }
    await fetchWorkspaces();
    return json?.data;
  }, [fetchWorkspaces]);

  const fetchMembers = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}/members`, { credentials: "include" });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to fetch members") : `Request failed (${res.status})`);
    }
    return (json?.data ?? []) as WorkspaceMember[];
  }, []);

  const addMember = useCallback(async (id: string, email: string, role: "member" | "admin") => {
    const res = await fetch(`/api/workspaces/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, role }),
    });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to add member") : `Request failed (${res.status})`);
    }
    await fetchWorkspaces();
    return json?.data;
  }, [fetchWorkspaces]);

  const removeMember = useCallback(async (workspaceId: string, memberId: string) => {
    if (!memberId || typeof memberId !== "string" || !memberId.trim()) {
      throw new Error("Invalid member ID");
    }
    const res = await fetch(`/api/workspaces/${workspaceId}/members?memberId=${memberId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to remove member") : `Request failed (${res.status})`);
    }
    await fetchWorkspaces();
    return json?.data;
  }, [fetchWorkspaces]);

  const fetchAuditLogs = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}/audit`, { credentials: "include" });
    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json ? extractErrorMessage(json, "Failed to fetch audit logs") : `Request failed (${res.status})`);
    }
    const data = json?.data as Record<string, unknown> | undefined;
    return (data?.logs ?? json?.logs ?? []) as AuditLogEntry[];
  }, []);

  return {
    workspaces,
    loading,
    error,
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    fetchMembers,
    addMember,
    removeMember,
    fetchAuditLogs,
  };
}

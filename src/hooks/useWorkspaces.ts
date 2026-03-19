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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Failed to fetch workspaces");
      setWorkspaces(json.workspaces ?? json.data?.workspaces ?? []);
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
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to create workspace");
    await fetchWorkspaces();
    return json.data;
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
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to update workspace");
    await fetchWorkspaces();
    return json.data;
  }, [fetchWorkspaces]);

  const deleteWorkspace = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to delete workspace");
    await fetchWorkspaces();
    return json.data;
  }, [fetchWorkspaces]);

  const fetchMembers = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}/members`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to fetch members");
    return json.data as WorkspaceMember[];
  }, []);

  const addMember = useCallback(async (id: string, email: string, role: "member" | "admin") => {
    const res = await fetch(`/api/workspaces/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to add member");
    await fetchWorkspaces();
    return json.data;
  }, [fetchWorkspaces]);

  const removeMember = useCallback(async (workspaceId: string, memberId: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/members?memberId=${memberId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to remove member");
    await fetchWorkspaces();
    return json.data;
  }, [fetchWorkspaces]);

  const fetchAuditLogs = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}/audit`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Failed to fetch audit logs");
    return (json.data?.logs ?? json.logs ?? []) as AuditLogEntry[];
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

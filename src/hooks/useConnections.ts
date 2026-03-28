"use client";

import { useState, useEffect, useCallback } from "react";

export interface ConnectionUser {
  id: string;
  userId: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  userStatus: string;
  connectionStatus: string;
  direction?: "sent" | "received";
  createdAt: string;
}

export interface UseConnectionsReturn {
  connections: ConnectionUser[];
  requests: ConnectionUser[];
  sent: ConnectionUser[];
  loading: boolean;
  requestCount: number;
  sendRequest: (email: string) => Promise<{ success: boolean; error?: string }>;
  acceptRequest: (id: string) => Promise<void>;
  declineRequest: (id: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const body = await res.json();

  if (!res.ok || !body.success) {
    throw new Error(body.error?.message || body.message || "Request failed");
  }

  return body.data as T;
}

export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<ConnectionUser[]>([]);
  const [requests, setRequests] = useState<ConnectionUser[]>([]);
  const [sent, setSent] = useState<ConnectionUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [acceptedData, requestsData, pendingData] = await Promise.all([
        apiFetch<ConnectionUser[]>("/api/connections?status=accepted"),
        apiFetch<ConnectionUser[]>("/api/connections/requests"),
        apiFetch<ConnectionUser[]>("/api/connections?status=pending"),
      ]);

      setConnections(acceptedData);
      setRequests(requestsData);
      setSent(pendingData.filter((c) => c.direction === "sent"));
    } catch {
      // best effort — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Poll for new connection requests every 10 seconds
    const intervalId = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refresh();
    }, 10_000);

    return () => clearInterval(intervalId);
  }, [refresh]);

  const sendRequest = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await apiFetch("/api/connections", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        await refresh();
        return { success: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send request";
        return { success: false, error: message };
      }
    },
    [refresh]
  );

  const acceptRequest = useCallback(
    async (id: string): Promise<void> => {
      try {
        await apiFetch(`/api/connections/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "accept" }),
        });
        await refresh();
      } catch {
        // fire-and-forget
      }
    },
    [refresh]
  );

  const declineRequest = useCallback(
    async (id: string): Promise<void> => {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      try {
        await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      } catch {
        // optimistic — no rollback
      }
    },
    []
  );

  const removeConnection = useCallback(
    async (id: string): Promise<void> => {
      setConnections((prev) => prev.filter((c) => c.id !== id));
      try {
        await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      } catch {
        // optimistic — no rollback
      }
    },
    []
  );

  const cancelRequest = useCallback(
    async (id: string): Promise<void> => {
      setSent((prev) => prev.filter((s) => s.id !== id));
      try {
        await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      } catch {
        // optimistic — no rollback
      }
    },
    []
  );

  return {
    connections,
    requests,
    sent,
    loading,
    requestCount: requests.length,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeConnection,
    cancelRequest,
    refresh,
  };
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface PendingAction {
  actionId: string;
  actionType: string;
  args: Record<string, unknown>;
  summary: string;
  status: "pending" | "confirming" | "confirmed" | "denied" | "revising";
  result?: string;
}

export function usePendingActions() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const actionsRef = useRef<PendingAction[]>([]);

  // Keep ref in sync so we can read current state without Promise-inside-setState
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  // Clear all pending timers on unmount
  useEffect(() => {
    const timers = cleanupTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const addAction = useCallback((action: Omit<PendingAction, "status">) => {
    setActions((prev) => [
      { ...action, status: "pending" },
      ...prev,
    ]);
  }, []);

  const confirmAction = useCallback(async (actionId: string) => {
    // Read current action from ref — avoids Promise-inside-setState which
    // breaks under React Concurrent Mode (updater can run multiple times).
    const actionSnapshot = actionsRef.current.find((a) => a.actionId === actionId);
    if (!actionSnapshot) return;

    setActions((prev) =>
      prev.map((a) => (a.actionId === actionId ? { ...a, status: "confirming" as const } : a))
    );

    try {
      setError(null);
      const res = await fetch("/api/ai/action/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actionType: actionSnapshot.actionType, args: actionSnapshot.args }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Confirm failed");
      }
      setActions((prev) =>
        prev.map((a) =>
          a.actionId === actionId
            ? { ...a, status: "confirmed" as const, result: data.data?.summary || "Done" }
            : a
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setError(msg);
      setActions((prev) =>
        prev.map((a) => (a.actionId === actionId ? { ...a, status: "pending" as const } : a))
      );
    }
  }, []);

  const denyAction = useCallback((actionId: string) => {
    setActions((prev) =>
      prev.map((a) => (a.actionId === actionId ? { ...a, status: "denied" as const } : a))
    );
  }, []);

  const reviseAction = useCallback(
    async (actionId: string, userFeedback: string) => {
      // Read from ref — avoids Promise-inside-setState antipattern
      const actionSnapshot = actionsRef.current.find((a) => a.actionId === actionId);
      if (!actionSnapshot) return;

      setActions((prev) =>
        prev.map((a) => (a.actionId === actionId ? { ...a, status: "revising" as const } : a))
      );

      try {
        setError(null);
        const res = await fetch("/api/ai/action/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            actionType: actionSnapshot.actionType,
            args: actionSnapshot.args,
            summary: actionSnapshot.summary,
            userFeedback,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Revision failed (${res.status})`);
        }

        const data = await res.json();
        if (data.success && data.data) {
          setActions((prev) =>
            prev.map((a) =>
              a.actionId === actionId
                ? {
                    ...a,
                    actionType: data.data.actionType,
                    args: data.data.args,
                    summary: data.data.summary,
                    status: "pending" as const,
                  }
                : a
            )
          );
        } else {
          setActions((prev) =>
            prev.map((a) => (a.actionId === actionId ? { ...a, status: "pending" as const } : a))
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Revision failed";
        setError(msg);
        setActions((prev) =>
          prev.map((a) => (a.actionId === actionId ? { ...a, status: "pending" as const } : a))
        );
      }
    },
    []
  );

  // Filter out denied actions for display
  const pendingActions = actions.filter((a) => a.status !== "denied");

  // Wrap confirmAction to auto-clean only on success.
  // Reads from actionsRef (not a state updater) to avoid impure side effects
  // inside setState — updaters must be pure as React may invoke them twice
  // under Strict Mode / Concurrent features.
  const confirmAndClear = useCallback(async (actionId: string) => {
    await confirmAction(actionId);
    const action = actionsRef.current.find((a) => a.actionId === actionId);
    if (action?.status === "confirmed") {
      const timer = setTimeout(() => {
        cleanupTimersRef.current.delete(actionId);
        setActions((p) => p.filter((a) => a.actionId !== actionId));
      }, 2000);
      cleanupTimersRef.current.set(actionId, timer);
    }
  }, [confirmAction]);

  const clearError = useCallback(() => setError(null), []);

  return { actions, pendingActions, error, clearError, addAction, confirmAction: confirmAndClear, denyAction, reviseAction };
}

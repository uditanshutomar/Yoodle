"use client";

import { useState, useCallback } from "react";

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

  const addAction = useCallback((action: Omit<PendingAction, "status">) => {
    setActions((prev) => [
      { ...action, status: "pending" },
      ...prev,
    ]);
  }, []);

  const confirmAction = useCallback(async (actionId: string) => {
    // Read the action from state via the setter to avoid stale closures
    let actionSnapshot: PendingAction | undefined;
    setActions((prev) => {
      actionSnapshot = prev.find((a) => a.actionId === actionId);
      if (!actionSnapshot) return prev;
      return prev.map((a) => (a.actionId === actionId ? { ...a, status: "confirming" as const } : a));
    });

    // Wait a tick for the setter to run, then use the snapshot
    await new Promise((r) => setTimeout(r, 0));
    if (!actionSnapshot) return;

    try {
      const res = await fetch("/api/ai/action/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actionType: actionSnapshot.actionType, args: actionSnapshot.args }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Confirm failed");
      }
      setActions((prev) =>
        prev.map((a) =>
          a.actionId === actionId
            ? { ...a, status: "confirmed" as const, result: data.data?.summary || "Done" }
            : a
        )
      );
    } catch {
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
      let actionSnapshot: PendingAction | undefined;
      setActions((prev) => {
        actionSnapshot = prev.find((a) => a.actionId === actionId);
        if (!actionSnapshot) return prev;
        return prev.map((a) => (a.actionId === actionId ? { ...a, status: "revising" as const } : a));
      });

      await new Promise((r) => setTimeout(r, 0));
      if (!actionSnapshot) return;

      try {
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
      } catch {
        setActions((prev) =>
          prev.map((a) => (a.actionId === actionId ? { ...a, status: "pending" as const } : a))
        );
      }
    },
    []
  );

  const clearResolved = useCallback(() => {
    setActions((prev) => prev.filter((a) => a.status === "pending" || a.status === "confirming" || a.status === "revising"));
  }, []);

  // Show confirmed/denied cards briefly (2s) before removing them
  const pendingActions = actions.filter((a) => a.status !== "denied");

  // Auto-clear confirmed actions after 2 seconds
  const autoCleanConfirmed = useCallback((actionId: string) => {
    setTimeout(() => {
      setActions((prev) => prev.filter((a) => a.actionId !== actionId));
    }, 2000);
  }, []);

  // Wrap confirmAction to auto-clear after success
  const confirmAndClear = useCallback(async (actionId: string) => {
    await confirmAction(actionId);
    autoCleanConfirmed(actionId);
  }, [confirmAction, autoCleanConfirmed]);

  return { actions, pendingActions, addAction, confirmAction: confirmAndClear, denyAction, reviseAction, clearResolved };
}

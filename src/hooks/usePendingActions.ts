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
    setActions((prev) => {
      const action = prev.find((a) => a.actionId === actionId);
      if (!action) return prev;
      return prev.map((a) => (a.actionId === actionId ? { ...a, status: "confirming" as const } : a));
    });

    const action = actions.find((a) => a.actionId === actionId);
    if (!action) return;

    try {
      const res = await fetch("/api/ai/action/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actionType: action.actionType, args: action.args }),
      });

      const data = await res.json();
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
  }, [actions]);

  const denyAction = useCallback((actionId: string) => {
    setActions((prev) =>
      prev.map((a) => (a.actionId === actionId ? { ...a, status: "denied" as const } : a))
    );
  }, []);

  const reviseAction = useCallback(
    async (actionId: string, userFeedback: string) => {
      const action = actions.find((a) => a.actionId === actionId);
      if (!action) return;

      setActions((prev) =>
        prev.map((a) => (a.actionId === actionId ? { ...a, status: "revising" as const } : a))
      );

      try {
        const res = await fetch("/api/ai/action/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            actionType: action.actionType,
            args: action.args,
            summary: action.summary,
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
    [actions]
  );

  const clearResolved = useCallback(() => {
    setActions((prev) => prev.filter((a) => a.status === "pending" || a.status === "confirming" || a.status === "revising"));
  }, []);

  const pendingActions = actions.filter((a) => a.status !== "confirmed" && a.status !== "denied");

  return { actions, pendingActions, addAction, confirmAction, denyAction, reviseAction, clearResolved };
}

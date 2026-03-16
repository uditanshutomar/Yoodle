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
  const cleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
    // Read current action snapshot synchronously, then update status
    const actionSnapshot = await new Promise<PendingAction | undefined>((resolve) => {
      setActions((prev) => {
        const found = prev.find((a) => a.actionId === actionId);
        resolve(found);
        if (!found) return prev;
        return prev.map((a) => (a.actionId === actionId ? { ...a, status: "confirming" as const } : a));
      });
    });
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
        throw new Error(data?.error?.message || "Confirm failed");
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
      const actionSnapshot = await new Promise<PendingAction | undefined>((resolve) => {
        setActions((prev) => {
          const found = prev.find((a) => a.actionId === actionId);
          resolve(found);
          if (!found) return prev;
          return prev.map((a) => (a.actionId === actionId ? { ...a, status: "revising" as const } : a));
        });
      });
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

  // Filter out denied actions for display
  const pendingActions = actions.filter((a) => a.status !== "denied");

  // Wrap confirmAction to auto-clean only on success
  const confirmAndClear = useCallback(async (actionId: string) => {
    await confirmAction(actionId);
    // Read current state to check if confirmation succeeded — use a ref-stable
    // getter instead of putting setTimeout inside a state setter.
    setActions((prev) => {
      const action = prev.find((a) => a.actionId === actionId);
      if (action?.status === "confirmed") {
        // Schedule cleanup outside the setter via microtask
        queueMicrotask(() => {
          const timer = setTimeout(() => {
            cleanupTimersRef.current.delete(actionId);
            setActions((p) => p.filter((a) => a.actionId !== actionId));
          }, 2000);
          cleanupTimersRef.current.set(actionId, timer);
        });
      }
      return prev;
    });
  }, [confirmAction]);

  return { actions, pendingActions, addAction, confirmAction: confirmAndClear, denyAction, reviseAction };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { MASCOT_BY_MODE } from "@/components/ai/constants";
import { useAuth } from "@/hooks/useAuth";

export type UserMode = "social" | "lockin" | "invisible";

interface UseUserModeReturn {
  mode: UserMode;
  mascot: string;
  switchMode: (newMode: UserMode) => Promise<void>;
  loading: boolean;
}

export function useUserMode(): UseUserModeReturn {
  const { refreshSession } = useAuth();
  const [mode, setMode] = useState<UserMode>("social");
  const [loading, setLoading] = useState(true);

  // Fetch initial mode from profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me", { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data?.mode) {
          setMode(json.data.mode);
        }
      } catch {
        // Best-effort — default to social
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const switchMode = useCallback(async (newMode: UserMode) => {
    const prev = mode;
    setMode(newMode); // optimistic
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: newMode }),
      });
      if (!res.ok) {
        setMode(prev); // rollback
      } else {
        // Refresh auth context so the AI FAB mascot and other
        // components using useAuth() pick up the new mode
        refreshSession();
      }
    } catch {
      setMode(prev); // rollback
    }
  }, [mode, refreshSession]);

  return {
    mode,
    mascot: MASCOT_BY_MODE[mode] || MASCOT_BY_MODE.social,
    switchMode,
    loading,
  };
}

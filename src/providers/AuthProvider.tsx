"use client";

import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type UserMode = "lockin" | "invisible" | "social";

export interface AuthUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatar?: string | null;
  mode?: UserMode;
  hasGoogleAccess?: boolean;
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  loginWithGoogle: (redirect?: string) => Promise<{ success: boolean; url?: string; message: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshSession = useCallback(async () => {
    try {
      let res = await fetch("/api/auth/session", { credentials: "include" });

      // If access token expired, try refreshing it
      if (res.status === 401) {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (refreshRes.ok) {
          // Retry session with new access token
          res = await fetch("/api/auth/session", { credentials: "include" });
        }
      }

      if (res.ok) {
        const json = await res.json();
        const u = json.data;
        if (u) {
          setUser({
            id: u.id,
            name: u.name,
            displayName: u.displayName,
            email: u.email,
            avatar: u.avatarUrl || null,
            mode: u.mode || "social",
            hasGoogleAccess: !!u.hasGoogleAccess,
          });
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loginWithGoogle = async (
    redirect?: string
  ): Promise<{ success: boolean; url?: string; message: string }> => {
    try {
      const redirectPath = redirect || "/dashboard";
      const res = await fetch(
        `/api/auth/google?redirect=${encodeURIComponent(redirectPath)}`
      );
      const data = await res.json();

      if (res.ok && data.data?.url) {
        return { success: true, url: data.data.url, message: "Redirecting to Google..." };
      }
      return { success: false, message: data.message || "Failed to start Google sign-in." };
    } catch {
      return { success: false, message: "Network error. Try again." };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Proceed with client-side logout even if API fails
    }
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

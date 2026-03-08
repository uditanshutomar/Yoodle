"use client";

import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface AuthUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatar?: string | null;
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string) => Promise<{ success: boolean; message: string }>;
  signup: (email: string, name: string, displayName: string) => Promise<{ success: boolean; message: string }>;
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

  const login = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message || "Magic link sent! Check your email." };
      }
      return { success: false, message: data.message || "Something went wrong." };
    } catch {
      return { success: false, message: "Network error. Try again." };
    }
  };

  const signup = async (
    email: string,
    name: string,
    displayName: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message || "Account created! Check your email." };
      }
      return { success: false, message: data.message || "Something went wrong." };
    } catch {
      return { success: false, message: "Network error. Try again." };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    } catch {
      // Proceed with client-side logout even if API fails
    }
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

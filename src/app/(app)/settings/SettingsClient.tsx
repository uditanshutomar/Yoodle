"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Settings, User, Bell, Palette, Shield, Save, Sun, Moon, Monitor, Link2, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import WorkspaceSection from "@/components/settings/WorkspaceSection";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, type Theme } from "@/providers/ThemeProvider";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "auto", label: "System", icon: Monitor },
];

export default function SettingsClient() {
  const { user, refreshSession } = useAuth();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleanup save status timer on unmount
  useEffect(() => {
    return () => { clearTimeout(saveTimerRef.current); };
  }, []);

  // Load user preferences on mount
  useEffect(() => {
    if (!user) return;
    if (user.displayName) setDisplayName(user.displayName);
    else if (user.name) setDisplayName(user.name);

    // Fetch full user preferences from API to load notifications etc.
    async function loadPreferences() {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const prefs = json.data?.preferences;
          if (prefs) {
            setNotifications(prefs.notifications ?? true);
            // Sync theme from server if different from local
            if (prefs.theme && prefs.theme !== theme) {
              setTheme(prefs.theme);
            }
          }
        }
      } catch (err) {
        console.warn("[Settings] Failed to load preferences:", err);
      }
    }

    loadPreferences();
    // Only run once on mount when user is available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName,
          preferences: {
            notifications,
            theme,
          },
        }),
      });
      if (res.ok) {
        setSaveStatus("success");
        await refreshSession();
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6 max-w-2xl">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--foreground)] border-2 border-[var(--border-strong)]">
          <Settings size={20} className="text-[var(--background)]" />
        </div>
        <h1 className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          Settings
        </h1>
      </motion.div>

      {/* Profile */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <User size={16} /> Profile
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" style={{ fontFamily: "var(--font-heading)" }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" style={{ fontFamily: "var(--font-heading)" }}>
                Email
              </label>
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface-hover)] text-[var(--text-muted)] cursor-not-allowed"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Notifications */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <Bell size={16} /> Notifications
          </h2>
          <ToggleSetting
            label="Meeting reminders"
            description="Get notified before meetings start"
            checked={notifications}
            onChange={setNotifications}
          />
        </Card>
      </motion.div>

      {/* Appearance */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <Palette size={16} /> Appearance
          </h2>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
              Theme
            </p>
            <p className="text-xs text-[var(--text-secondary)] mb-3" style={{ fontFamily: "var(--font-body)" }}>
              Choose your preferred color scheme
            </p>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setTheme(opt.value);
                      // Auto-persist theme change so it's not lost on navigation
                      fetch("/api/users/me", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ preferences: { theme: opt.value } }),
                      }).catch(() => {});
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      isActive
                        ? "border-[#FFE600] bg-[#FFE600]/10 text-[var(--text-primary)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
                    }`}
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    <Icon size={14} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Connected Accounts */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <Link2 size={16} /> Connected Accounts
          </h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Google icon */}
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                  Google Workspace
                </p>
                <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
                  {user?.hasGoogleAccess
                    ? "Connected \u2014 Calendar, Tasks, and Drive access enabled"
                    : "Connect for Calendar, Tasks, and Drive features"}
                </p>
              </div>
            </div>
            {user?.hasGoogleAccess ? (
              <span
                className="text-xs font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-full px-3 py-1"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Connected
              </span>
            ) : (
              <GoogleConnectButton />
            )}
          </div>
        </Card>
      </motion.div>

      {/* Security */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <Shield size={16} /> Security
          </h2>
          <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
            Your account uses passwordless magic link authentication. No password to manage.
          </p>
        </Card>
      </motion.div>

      {/* Workspaces */}
      <motion.div variants={itemVariants}>
        <WorkspaceSection />
      </motion.div>

      {/* Save button */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <Button variant="primary" size="md" icon={Save} onClick={handleSave} disabled={saving}>
          {saving ? "Saving\u2026" : "Save Changes"}
        </Button>
        {saveStatus === "success" && (
          <span className="text-sm font-bold text-green-600" style={{ fontFamily: "var(--font-body)" }}>
            Saved!
          </span>
        )}
        {saveStatus === "error" && (
          <span className="text-sm font-bold text-[#FF6B6B]" style={{ fontFamily: "var(--font-body)" }}>
            Failed to save. Try again.
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}

function GoogleConnectButton() {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/auth/google?redirect=/settings", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.data?.url) {
        console.warn("[Settings] Google connect: unexpected response", res.status);
        setConnecting(false);
        return;
      }
      window.location.href = data.data.url;
    } catch (err) {
      console.warn("[Settings] Google connect failed:", err);
      setConnecting(false);
    }
  };

  return (
    <button
      onClick={handleConnect}
      disabled={connecting}
      className="flex items-center gap-1.5 text-xs font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-3 py-1 hover:bg-[#3B82F6]/20 transition-colors disabled:opacity-50"
      style={{ fontFamily: "var(--font-heading)" }}
    >
      <ExternalLink size={10} />
      {connecting ? "Connecting\u2026" : "Connect"}
    </button>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>{label}</p>
        <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full border-2 border-[var(--border-strong)] transition-colors ${
          checked ? "bg-[#FFE600]" : "bg-[var(--text-muted)]"
        }`}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-[var(--foreground)]"
          animate={{ left: checked ? "calc(100% - 20px)" : "2px" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

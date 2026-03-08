"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, User, Bell, Palette, Shield, Save } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
    else if (user?.name) setDisplayName(user.name);
  }, [user]);

  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

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
            theme: darkMode ? "dark" : "light",
          },
        }),
      });
      if (res.ok) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2000);
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A0A0A] border-2 border-[#0A0A0A]">
          <Settings size={20} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
          Settings
        </h1>
      </motion.div>

      {/* Profile */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <User size={16} /> Profile
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#0A0A0A]/60 mb-1 block" style={{ fontFamily: "var(--font-heading)" }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border-2 border-[#0A0A0A]/10 rounded-xl bg-white focus:border-[#FFE600] focus:outline-none"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#0A0A0A]/60 mb-1 block" style={{ fontFamily: "var(--font-heading)" }}>
                Email
              </label>
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full px-4 py-2.5 text-sm border-2 border-[#0A0A0A]/5 rounded-xl bg-[#0A0A0A]/5 text-[#0A0A0A]/50 cursor-not-allowed"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Notifications */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
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
          <h2 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <Palette size={16} /> Appearance
          </h2>
          <ToggleSetting
            label="Dark mode"
            description="Switch to a darker color scheme (coming soon)"
            checked={darkMode}
            onChange={setDarkMode}
          />
        </Card>
      </motion.div>

      {/* Security */}
      <motion.div variants={itemVariants}>
        <Card className="!p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            <Shield size={16} /> Security
          </h2>
          <p className="text-xs text-[#0A0A0A]/50" style={{ fontFamily: "var(--font-body)" }}>
            Your account uses passwordless magic link authentication. No password to manage.
          </p>
        </Card>
      </motion.div>

      {/* Save button */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <Button variant="primary" size="md" icon={Save} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
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
        <p className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>{label}</p>
        <p className="text-xs text-[#0A0A0A]/50" style={{ fontFamily: "var(--font-body)" }}>{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full border-2 border-[#0A0A0A] transition-colors ${
          checked ? "bg-[#FFE600]" : "bg-[#0A0A0A]/10"
        }`}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-[#0A0A0A]"
          animate={{ left: checked ? "calc(100% - 20px)" : "2px" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

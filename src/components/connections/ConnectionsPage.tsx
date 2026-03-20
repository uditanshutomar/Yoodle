"use client";

import { useState, useEffect, useRef } from "react";
import { Users, Send, UserCheck, Clock } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useConnections, type ConnectionUser } from "@/hooks/useConnections";

type Tab = "yoodlers" | "incoming" | "sent";

interface SearchUser {
  _id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

const statusDotColor: Record<string, string> = {
  online: "bg-green-500",
  "in-meeting": "bg-orange-400",
  dnd: "bg-red-500",
  offline: "bg-gray-400",
};

function Avatar({ user }: { user: ConnectionUser }) {
  if (user.avatarUrl) {
    return (
      <Image
        src={user.avatarUrl}
        alt={user.displayName}
        width={40}
        height={40}
        className="h-10 w-10 rounded-full border-2 border-[var(--border-strong)] object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[#FFE600] font-heading text-sm font-black text-[#0A0A0A]">
      {user.displayName?.charAt(0)?.toUpperCase() ?? "?"}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full border border-white ${statusDotColor[status] ?? statusDotColor.offline}`}
    />
  );
}

export default function ConnectionsPage() {
  const {
    connections,
    requests,
    sent,
    loading,
    requestCount,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeConnection,
    cancelRequest,
  } = useConnections();

  const [activeTab, setActiveTab] = useState<Tab>("yoodlers");
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search for autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = email.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmed)}&limit=5`,
          { credentials: "include" }
        );
        const body = await res.json();
        if (body.success && Array.isArray(body.data)) {
          setSuggestions(body.data);
          setShowSuggestions(body.data.length > 0);
          setSelectedIndex(-1);
        }
      } catch {
        // best effort
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (user: SearchUser) => {
    setEmail(user.email);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    setSending(true);
    setFeedback(null);

    const result = await sendRequest(trimmed);

    if (result.success) {
      setFeedback({ type: "success", message: "Yoodle request sent!" });
      setEmail("");
    } else {
      setFeedback({ type: "error", message: result.error ?? "Something went wrong" });
    }

    setSending(false);
  };

  const tabs: { key: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { key: "yoodlers", label: "Yoodlers", icon: Users },
    { key: "incoming", label: "Incoming", icon: UserCheck, badge: requestCount },
    { key: "sent", label: "Sent", icon: Clock },
  ];

  const listForTab: Record<Tab, ConnectionUser[]> = {
    yoodlers: connections,
    incoming: requests,
    sent,
  };

  const emptyMessages: Record<Tab, string> = {
    yoodlers: "No Yoodlers yet. Send your first Yoodle request!",
    incoming: "No pending vibes. You're all caught up.",
    sent: "You haven't sent any Yoodle requests yet.",
  };

  const currentList = listForTab[activeTab];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-black text-[var(--text-primary)]">Connections</h1>
        <p className="font-body text-sm text-[var(--text-muted)]">Your circle of Yoodlers</p>
      </div>

      {/* Send Yoodle Request */}
      <div className="mb-8 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[4px_4px_0_var(--border-strong)]">
        <div className="flex gap-2" ref={wrapperRef}>
          <div className="relative flex-1">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFeedback(null);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (showSuggestions && suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex((prev) =>
                      prev < suggestions.length - 1 ? prev + 1 : 0
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex((prev) =>
                      prev > 0 ? prev - 1 : suggestions.length - 1
                    );
                  } else if (e.key === "Enter" && selectedIndex >= 0) {
                    e.preventDefault();
                    selectSuggestion(suggestions[selectedIndex]);
                  } else if (e.key === "Escape") {
                    setShowSuggestions(false);
                  } else if (e.key === "Enter") {
                    handleSend();
                  }
                } else if (e.key === "Enter") {
                  handleSend();
                }
              }}
              placeholder="Search by name or email..."
              autoComplete="off"
              className="w-full rounded-lg border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
            />

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
                {suggestions.map((user, i) => (
                  <button
                    key={user._id}
                    type="button"
                    onClick={() => selectSuggestion(user)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                      i === selectedIndex
                        ? "bg-[#FFE600]/20"
                        : "hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt={user.displayName}
                        width={28}
                        height={28}
                        className="h-7 w-7 rounded-full border border-[var(--border)] object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[#FFE600]/20 font-heading text-xs font-bold">
                        {user.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm font-bold text-[var(--text-primary)]">
                        {user.displayName || user.name}
                      </p>
                      <p className="truncate font-body text-xs text-[var(--text-muted)]">
                        {user.email}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !email.trim()}
            className="flex items-center gap-1.5 rounded-lg border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)] transition-all hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-40 cursor-pointer font-heading"
          >
            <Send size={14} />
            Send Yoodle
          </button>
        </div>
        {feedback && (
          <p
            className={`mt-2 text-xs font-body ${
              feedback.type === "success" ? "text-green-600" : "text-[#FF6B6B]"
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-[4px_4px_0_var(--border-strong)]">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-all cursor-pointer font-heading ${
                  isActive
                    ? "bg-[#FFE600] font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                    : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <tab.icon size={15} />
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0A0A0A] px-1 text-[10px] font-black text-[#FFE600] tabular-nums">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center font-body text-sm text-[var(--text-muted)]">Loading...</div>
      ) : currentList.length === 0 ? (
        <div className="py-12 text-center font-body text-sm text-[var(--text-muted)]">
          {emptyMessages[activeTab]}
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {currentList.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 shadow-[2px_2px_0_var(--border-strong)]"
              >
                <div className="relative">
                  <Avatar user={user} />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <StatusDot status={user.userStatus} />
                  </span>
                </div>

                <span className="flex-1 truncate font-heading text-sm font-bold text-[var(--text-primary)]">
                  {user.displayName}
                </span>

                {/* Action buttons per tab */}
                {activeTab === "yoodlers" && (
                  <button
                    onClick={() => removeConnection(user.id)}
                    className="rounded-lg border-2 border-[var(--border-strong)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer font-heading"
                  >
                    Remove
                  </button>
                )}

                {activeTab === "incoming" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => acceptRequest(user.id)}
                      className="rounded-lg border-2 border-[var(--border-strong)] bg-[#FFE600] px-3 py-1 text-xs font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)] transition-all hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer font-heading"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(user.id)}
                      className="rounded-lg border-2 border-[var(--border-strong)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer font-heading"
                    >
                      Nah
                    </button>
                  </div>
                )}

                {activeTab === "sent" && (
                  <button
                    onClick={() => cancelRequest(user.id)}
                    className="rounded-lg border-2 border-[var(--border-strong)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer font-heading"
                  >
                    Unsend
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

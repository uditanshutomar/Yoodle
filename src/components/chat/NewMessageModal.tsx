"use client";

import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Search, Loader2, Users, MessageCircle } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { useConversations } from "@/hooks/useConversations";

// ── Types ─────────────────────────────────────────────────────────────────

interface SearchUser {
  _id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
  status?: "online" | "offline" | "in-meeting" | "dnd";
}

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConversationCreated: (conversationId: string) => void;
}

type Tab = "chat" | "group";

// ── Component ─────────────────────────────────────────────────────────────

export default function NewMessageModal({
  isOpen,
  onClose,
  onConversationCreated,
}: NewMessageModalProps) {
  const { createDM, createGroup } = useConversations();

  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  // Group-specific state
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<SearchUser[]>([]);

  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // ── Helpers ────────────────────────────────────────────────────────────

  const resetState = () => {
    setSearchQuery("");
    setResults([]);
    setSearching(false);
    setCreating(false);
    setGroupName("");
    setSelectedMembers([]);
    setActiveTab("chat");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`,
          { credentials: "include" },
        );
        const data = await res.json();
        if (data.success) setResults(data.data || []);
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectUserForDM = async (user: SearchUser) => {
    if (creating) return;
    setCreating(true);
    const id = await createDM(user._id);
    if (id) {
      onConversationCreated(id);
      handleClose();
    }
    setCreating(false);
  };

  const toggleMember = (user: SearchUser) => {
    setSelectedMembers((prev) =>
      prev.some((m) => m._id === user._id)
        ? prev.filter((m) => m._id !== user._id)
        : [...prev, user],
    );
  };

  const removeMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m._id !== userId));
  };

  const handleCreateGroup = async () => {
    if (creating || !groupName.trim() || selectedMembers.length === 0) return;
    setCreating(true);
    const ids = selectedMembers.map((m) => m._id);
    const id = await createGroup(groupName.trim(), ids);
    if (id) {
      onConversationCreated(id);
      handleClose();
    }
    setCreating(false);
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setResults([]);
    setSearching(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            className="relative bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-card)] w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <h2
                className="text-lg text-[var(--text-primary)] font-bold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                New Message
              </h2>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] mx-5 mt-3">
              <button
                onClick={() => switchTab("chat")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === "chat"
                    ? "border-b-2 border-[#FFE600] text-[var(--text-primary)] font-bold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <MessageCircle size={16} />
                New Chat
              </button>
              <button
                onClick={() => switchTab("group")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === "group"
                    ? "border-b-2 border-[#FFE600] text-[var(--text-primary)] font-bold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Users size={16} />
                New Group
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Group name input (group tab only) */}
              {activeTab === "group" && (
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-transparent border-2 border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#FFE600] focus:outline-none transition-colors"
                  />
                </div>
              )}

              {/* Selected members pills (group tab only) */}
              {activeTab === "group" && selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedMembers.map((member) => (
                    <span
                      key={member._id}
                      className="flex items-center gap-1 bg-[#FFE600]/20 rounded-full px-3 py-1 text-sm text-[var(--text-primary)]"
                    >
                      {member.displayName || member.name}
                      <button
                        onClick={() => removeMember(member._id)}
                        className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search input */}
              <div className="relative mb-3">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-transparent border-2 border-[var(--border)] rounded-xl pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#FFE600] focus:outline-none transition-colors"
                />
              </div>

              {/* Loading */}
              {searching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2
                    size={24}
                    className="animate-spin text-[var(--text-muted)]"
                  />
                </div>
              )}

              {/* Results */}
              {!searching && results.length > 0 && (
                <ul className="space-y-1">
                  {results.map((user) => {
                    const isSelected =
                      activeTab === "group" &&
                      selectedMembers.some((m) => m._id === user._id);

                    return (
                      <li key={user._id}>
                        <button
                          onClick={() =>
                            activeTab === "chat"
                              ? handleSelectUserForDM(user)
                              : toggleMember(user)
                          }
                          disabled={activeTab === "chat" && creating}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                            isSelected
                              ? "bg-[#FFE600]/10"
                              : "hover:bg-[var(--surface-hover)]"
                          }`}
                        >
                          <Avatar
                            src={user.avatarUrl}
                            name={user.displayName || user.name}
                            size="sm"
                            status={user.status as "online" | "offline" | "in-meeting" | "dnd" | undefined}
                          />
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {user.displayName || user.name}
                            </p>
                            {user.displayName && user.displayName !== user.name && (
                              <p className="text-xs text-[var(--text-muted)] truncate">
                                {user.name}
                              </p>
                            )}
                          </div>
                          {user.status && (
                            <span
                              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                user.status === "online"
                                  ? "bg-green-400"
                                  : user.status === "in-meeting"
                                    ? "bg-[#FFE600]"
                                    : user.status === "dnd"
                                      ? "bg-[#FF6B6B]"
                                      : "bg-gray-400"
                              }`}
                            />
                          )}
                          {isSelected && (
                            <span className="text-xs text-[#FFE600] font-bold">
                              Added
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Empty state */}
              {!searching &&
                searchQuery.trim() !== "" &&
                results.length === 0 && (
                  <p className="text-center text-sm text-[var(--text-muted)] py-8">
                    No users found
                  </p>
                )}

              {/* Initial state */}
              {!searching &&
                searchQuery.trim() === "" &&
                results.length === 0 && (
                  <p className="text-center text-sm text-[var(--text-muted)] py-8">
                    {activeTab === "chat"
                      ? "Search for a user to start a conversation"
                      : "Search for users to add to the group"}
                  </p>
                )}
            </div>

            {/* Footer — Create Group button (group tab only) */}
            {activeTab === "group" && (
              <div className="px-5 pb-5 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={handleCreateGroup}
                  disabled={
                    creating ||
                    !groupName.trim() ||
                    selectedMembers.length === 0
                  }
                  className="w-full bg-[#FFE600] border-2 border-[var(--border-strong)] rounded-xl px-4 py-2 font-bold text-[#0A0A0A] text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {creating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Users size={16} />
                  )}
                  Create Group
                  {selectedMembers.length > 0 &&
                    ` (${selectedMembers.length})`}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, MessageCircle } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { useConversations, type ConversationInfo } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────────

interface ConversationListProps {
  activeId?: string;
  onSelect: (conversationId: string) => void;
  onNewMessage?: () => void;
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ConversationList({
  activeId,
  onSelect,
  onNewMessage,
  className = "",
}: ConversationListProps) {
  const { user } = useAuth();
  const { conversations, loading } = useConversations();
  const [search, setSearch] = useState("");

  // Filter & sort conversations
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    const list = conversations.filter((c) => {
      if (!query) return true;

      // Match group name
      if (c.name?.toLowerCase().includes(query)) return true;

      // Match participant names
      return c.participants.some(
        (p) =>
          p._id !== user?.id &&
          (p.name.toLowerCase().includes(query) ||
            p.displayName?.toLowerCase().includes(query)),
      );
    });

    // Sort by most recent message (or updatedAt fallback)
    return list.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.updatedAt;
      const bTime = b.lastMessage?.createdAt ?? b.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [conversations, search, user?.id]);

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`flex flex-col ${className}`}>
        <Header onNewMessage={onNewMessage} />
        <div className="flex flex-col gap-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-[var(--border)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-[var(--border)]" />
                <div className="h-3 w-40 rounded bg-[var(--border)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <Header onNewMessage={onNewMessage} />

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[#FFE600] transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 px-4 text-center"
            >
              <MessageCircle className="h-12 w-12 text-[var(--text-muted)] mb-3" />
              <p
                className="text-[var(--text-secondary)] text-sm"
                style={{ fontFamily: "var(--font-body)" }}
              >
                No conversations yet
              </p>
              <p
                className="text-[var(--text-muted)] text-xs mt-1"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Start a new message to get chatting
              </p>
            </motion.div>
          ) : (
            filtered.map((convo) => (
              <ConversationItem
                key={convo._id}
                conversation={convo}
                active={convo._id === activeId}
                currentUserId={user?.id}
                onSelect={onSelect}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header({ onNewMessage }: { onNewMessage?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h2
        className="text-lg font-bold text-[var(--text-primary)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Messages
      </h2>
      {onNewMessage && (
        <button
          onClick={onNewMessage}
          className="flex items-center gap-1.5 rounded-lg bg-[#FFE600] px-3 py-1.5 text-sm font-semibold text-[#0A0A0A] border-2 border-[#0A0A0A] shadow-[2px_2px_0px_#0A0A0A] hover:shadow-[1px_1px_0px_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      )}
    </div>
  );
}

// ── Conversation Item ───────────────────────────────────────────────────────

function ConversationItem({
  conversation,
  active,
  currentUserId,
  onSelect,
}: {
  conversation: ConversationInfo;
  active: boolean;
  currentUserId?: string;
  onSelect: (id: string) => void;
}) {
  const isDM = conversation.type === "dm";
  const others = conversation.participants.filter(
    (p) => p._id !== currentUserId,
  );
  const dmPartner = others[0];

  const displayName = isDM
    ? dmPartner?.displayName ?? dmPartner?.name ?? "Unknown"
    : conversation.name ?? "Group Chat";

  const lastTime = conversation.lastMessage?.createdAt ?? conversation.updatedAt;
  const preview = conversation.lastMessage?.content;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onClick={() => onSelect(conversation._id)}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        active
          ? "bg-[#FFE600]/10 border-l-2 border-[#FFE600]"
          : "border-l-2 border-transparent hover:bg-[var(--surface-hover)]"
      }`}
    >
      {/* Avatar(s) */}
      {isDM ? (
        <Avatar
          src={dmPartner?.avatar}
          name={dmPartner?.name ?? "?"}
          size="md"
        />
      ) : (
        <StackedAvatars participants={others} />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-sm font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {displayName}
          </span>
          {lastTime && (
            <span
              className="shrink-0 text-xs text-[var(--text-muted)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {formatRelativeTime(lastTime)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className="truncate text-xs text-[var(--text-muted)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {preview ?? "No messages yet"}
          </p>
          {conversation.unreadCount > 0 && (
            <span className="shrink-0 flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[#FFE600] px-1.5 text-[10px] font-bold text-[#0A0A0A] border border-[#0A0A0A]">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ── Stacked Avatars for Groups ──────────────────────────────────────────────

function StackedAvatars({
  participants,
}: {
  participants: ConversationInfo["participants"];
}) {
  const shown = participants.slice(0, 3);

  return (
    <div className="relative h-10 w-10 shrink-0">
      {shown.map((p, i) => (
        <div
          key={p._id}
          className="absolute"
          style={{
            top: i * 4,
            left: i * 6,
            zIndex: shown.length - i,
          }}
        >
          <Avatar
            src={p.avatar}
            name={p.name}
            size="sm"
          />
        </div>
      ))}
    </div>
  );
}

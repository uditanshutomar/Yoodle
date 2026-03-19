"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  SendHorizontal,
  ChevronDown,
  Loader2,
  X,
  WifiOff,
  AlertCircle,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import MessageBubble from "@/components/chat/MessageBubble";
import VoiceInputButton from "@/components/chat/VoiceInputButton";
import { useAuth } from "@/hooks/useAuth";
import { useMessages, type ChatMsg } from "@/hooks/useMessages";
import type {
  ConversationInfo,
  ConversationParticipant,
} from "@/hooks/useConversations";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatThreadProps {
  conversationId: string;
  onBack?: () => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimeDivider(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;

  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}, ${time}`;
}

function shouldShowTimeDivider(
  current: ChatMsg,
  previous: ChatMsg | undefined,
): boolean {
  if (!previous) return true;
  const gap =
    new Date(current.createdAt).getTime() -
    new Date(previous.createdAt).getTime();
  return gap > 10 * 60 * 1000; // 10 minutes
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ChatThread({
  conversationId,
  onBack,
  className = "",
}: ChatThreadProps) {
  const { user } = useAuth();
  const {
    messages,
    loading,
    hasMore,
    typingUsers,
    connected,
    sendError,
    clearSendError,
    sendMessage,
    sendTyping,
    toggleReaction,
    markAsRead,
    loadMore,
  } = useMessages(conversationId);

  // ── Conversation info ──────────────────────────────────────────────────

  const [convoInfo, setConvoInfo] = useState<ConversationInfo | null>(null);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMsg | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchConvo() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          credentials: "include",
        });
        if (!res.ok) {
          console.warn("[ChatThread] conversation fetch failed:", res.status);
          return;
        }
        const json = await res.json();
        if (!json.success || !json.data) return;
        if (!cancelled) setConvoInfo(json.data as ConversationInfo);
      } catch (err) {
        console.warn("[ChatThread] failed to load conversation info:", err);
      }
    }

    if (conversationId) fetchConvo();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // ── Derived header info ────────────────────────────────────────────────

  const isDM = convoInfo?.type === "dm";
  const others: ConversationParticipant[] = useMemo(
    () =>
      convoInfo?.participants.filter((p) => p._id !== user?.id) ?? [],
    [convoInfo, user?.id],
  );
  const dmPartner = others[0];

  const headerTitle = isDM
    ? dmPartner?.displayName ?? dmPartner?.name ?? "Chat"
    : convoInfo?.name ?? "Group Chat";

  const headerSubtitle = isDM ? "Direct message" : `${(convoInfo?.participants.length ?? 0)} members`;

  // ── Scroll handling ────────────────────────────────────────────────────

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const prevMessageCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const loadingRef = useRef(loading);
  // useLayoutEffect ensures the ref is updated before any scroll handlers fire
  useLayoutEffect(() => { loadingRef.current = loading; }, [loading]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const nearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);

    // Load more when scrolled to top (use ref to avoid stale closure race)
    if (el.scrollTop < 50 && hasMore && !loadingRef.current) {
      loadMore();
    }
  }, [hasMore, loadMore]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isNearBottomRef.current) {
      scrollToBottom();
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Scroll to bottom on mount
  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom();
    }
    // Only on initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Mark as read on mount and new messages (debounced to avoid request storm)
  useEffect(() => {
    const t = setTimeout(() => markAsRead(), 500);
    return () => clearTimeout(t);
  }, [messages.length, markAsRead]);

  // ── Input handling ─────────────────────────────────────────────────────

  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceInterim, setVoiceInterim] = useState("");
  const isVoiceRecordingRef = useRef(false);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);

      // Auto-grow textarea
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;

      // Debounced typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping();
      }, 500);
    },
    [sendTyping],
  );

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    sendMessage(text, replyingTo?._id);
    setInputValue("");
    setReplyingTo(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Scroll to bottom after sending
    setTimeout(scrollToBottom, 50);
  }, [inputValue, replyingTo, sendMessage, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleVoiceTranscript = useCallback((text: string) => {
    setInputValue((prev) => (prev ? `${prev} ${text}` : text));
    setVoiceInterim("");
    isVoiceRecordingRef.current = false;
  }, []);

  // Clear typing timeout on unmount AND when conversation changes
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId]);

  // ── Agent toggle ───────────────────────────────────────────────────────

  const handleAgentToggle = useCallback(async () => {
    const next = !agentEnabled;
    setAgentEnabled(next);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/agent-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setAgentEnabled(!next);
      }
    } catch {
      // Revert on failure
      setAgentEnabled(!next);
    }
  }, [agentEnabled, conversationId]);

  // ── Reply handler (passed to MessageBubble) ────────────────────────────

  const handleReply = useCallback(
    (msg: ChatMsg) => {
      setReplyingTo(msg);
      textareaRef.current?.focus();
    },
    [],
  );

  // ── Consecutive sender detection ───────────────────────────────────────

  const messageItems = useMemo(() => {
    return messages.map((msg, i) => {
      const prev = i > 0 ? messages[i - 1] : undefined;
      const timeDivider = shouldShowTimeDivider(msg, prev);
      const showSender =
        timeDivider || !prev || prev.sender._id !== msg.sender._id;

      return { msg, timeDivider, showSender };
    });
  }, [messages]);

  // ── Typing indicator entries ───────────────────────────────────────────

  const typingEntries = useMemo(() => {
    const entries: { id: string; name: string; isAgent: boolean }[] = [];
    typingUsers.forEach((name, id) => {
      if (id !== user?.id) {
        entries.push({ id, name, isAgent: id.startsWith("agent_") });
      }
    });
    return entries;
  }, [typingUsers, user?.id]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col h-full bg-[var(--surface)] ${className}`}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b-2 border-[var(--border)] px-4 py-3 bg-[var(--surface)]">
        {/* Back button (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Go back to conversation list"
            className="lg:hidden p-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-[var(--text-primary)]" />
          </button>
        )}

        {/* Avatar + info */}
        {isDM ? (
          <Avatar
            src={dmPartner?.avatar}
            name={dmPartner?.name ?? "?"}
            size="md"
            status="online"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] flex items-center justify-center">
            <span
              className="text-sm font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {(convoInfo?.name ?? "G").charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold text-[var(--text-primary)] truncate"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {headerTitle}
          </h3>
          <p
            className="text-xs text-[var(--text-muted)] truncate"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {headerSubtitle}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleAgentToggle}
            className={`p-2 rounded-lg transition-colors ${
              agentEnabled
                ? "bg-[#FFE600] text-[#0A0A0A]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            }`}
            title="Toggle AI agent"
          >
            <Brain className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Connection / Error Banners ────────────────────────────────── */}
      <AnimatePresence>
        {!connected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 bg-[#EF4444]/10 border-b border-[#EF4444]/30 px-4 py-2">
              <WifiOff className="h-4 w-4 text-[#EF4444] flex-shrink-0" />
              <span className="text-xs text-[#EF4444] font-medium" style={{ fontFamily: "var(--font-body)" }}>
                Connection lost. Reconnecting…
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sendError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 bg-[#F59E0B]/10 border-b border-[#F59E0B]/30 px-4 py-2">
              <AlertCircle className="h-4 w-4 text-[#F59E0B] flex-shrink-0" />
              <span className="text-xs text-[#F59E0B] font-medium flex-1" style={{ fontFamily: "var(--font-body)" }}>
                {sendError}
              </span>
              <button onClick={clearSendError} className="p-0.5 rounded hover:bg-[#F59E0B]/20 transition-colors">
                <X className="h-3.5 w-3.5 text-[#F59E0B]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Message List ────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {/* Load more spinner */}
        {loading && hasMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p
              className="text-[var(--text-muted)] text-sm"
              style={{ fontFamily: "var(--font-body)" }}
            >
              No messages yet. Start the conversation!
            </p>
          </div>
        )}

        {/* Messages */}
        {messageItems.map(({ msg, timeDivider, showSender }) => (
          <div key={msg._id}>
            {/* Time divider */}
            {timeDivider && (
              <div className="flex items-center justify-center my-4">
                <span
                  className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-hover)] px-3 py-1 rounded-full"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {formatTimeDivider(new Date(msg.createdAt))}
                </span>
              </div>
            )}

            {/* Message bubble */}
            <MessageBubble
              message={msg}
              isOwn={msg.sender._id === user?.id}
              showSender={showSender}
              onReaction={(_messageId: string, emoji: string) => toggleReaction(msg._id, emoji)}
              onReply={() => handleReply(msg)}
              currentUserId={user?.id ?? ""}
            />
          </div>
        ))}

        {/* Typing indicators */}
        <AnimatePresence>
          {typingEntries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 py-1"
            >
              <span
                className="text-xs text-[var(--text-muted)] italic"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {entry.isAgent
                  ? `${entry.name}'s Doodle is thinking`
                  : `${entry.name} is typing`}
              </span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      entry.isAgent
                        ? "bg-[#FFE600]"
                        : "bg-[var(--text-muted)]"
                    }`}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: dot * 0.2,
                    }}
                  />
                ))}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Jump to bottom ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showJumpToBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            className="absolute bottom-24 right-6 z-10 flex items-center gap-1 rounded-full bg-[var(--surface)] border-2 border-[var(--border)] px-3 py-1.5 shadow-lg hover:bg-[var(--surface-hover)] transition-colors"
          >
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
            <span
              className="text-xs text-[var(--text-secondary)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Jump to bottom
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Input Area ──────────────────────────────────────────────────── */}
      <div className="border-t-2 border-[var(--border)] px-4 py-3 bg-[var(--surface)]">
        {/* Reply bar */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 bg-[var(--surface-hover)] border-l-2 border-[#FFE600] px-3 py-2 mb-2 rounded-r-md">
                <div className="min-w-0">
                  <p
                    className="text-xs font-semibold text-[var(--text-secondary)]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Replying to {replyingTo.sender.displayName ?? replyingTo.sender.name}
                  </p>
                  <p
                    className="text-xs text-[var(--text-muted)] truncate"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {replyingTo.content}
                  </p>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="shrink-0 p-0.5 rounded hover:bg-[var(--border)] transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={voiceInterim ? "" : "Type a message..."}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] max-h-[120px]"
            style={{ fontFamily: "var(--font-body)" }}
          />
          <VoiceInputButton
            onTranscript={handleVoiceTranscript}
            onInterim={setVoiceInterim}
            onRecordingStart={() => { isVoiceRecordingRef.current = true; }}
            onRecordingEnd={() => { isVoiceRecordingRef.current = false; setVoiceInterim(""); }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            aria-label="Send message"
            className={`shrink-0 p-2 rounded-lg transition-colors ${
              inputValue.trim()
                ? "bg-[#FFE600] text-[#0A0A0A] hover:brightness-95"
                : "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
            }`}
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
        {/* Voice interim preview */}
        {voiceInterim && (
          <p
            className="text-xs text-[var(--text-muted)] mt-1 italic truncate"
            style={{ fontFamily: "var(--font-body)" }}
          >
            🎙️ {voiceInterim}
          </p>
        )}
      </div>
    </div>
  );
}

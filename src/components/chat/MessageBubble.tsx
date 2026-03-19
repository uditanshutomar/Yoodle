"use client";

import { useState, useCallback } from "react";
import SafeMarkdown from "@/components/ai/SafeMarkdown";
import { CornerUpLeft, Check, X, Loader2, Zap } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { CardRenderer } from "@/components/ai/cards";
import type { CardData } from "@/components/ai/cards/types";
import type { ChatMsg } from "@/hooks/useMessages";

interface MessageBubbleProps {
  message: ChatMsg;
  isOwn: boolean;
  showSender: boolean;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMsg) => void;
  currentUserId: string;
}

// ── Constants ───────────────────────────────────────────────────────────

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "👀"];
const COLLAPSE_THRESHOLD = 300;

// ── Helpers ─────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

// ── Component ───────────────────────────────────────────────────────────

export default function MessageBubble({
  message,
  isOwn,
  showSender,
  onReaction,
  onReply,
  currentUserId,
}: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const senderType = message.senderType ?? "user";
  const isAgent = senderType === "agent";
  // System messages may have senderType "user" (DB default) but type "system"
  const isSystem = senderType === "system" || message.type === "system";

  const senderDisplayName =
    message.sender.displayName || message.sender.name || "Unknown";

  // ── System message (centered, no bubble) ────────────────────────────

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span
          className="text-sm italic"
          style={{ color: "var(--text-muted)" }}
          title={formatTime(message.createdAt)}
        >
          {message.content}
        </span>
      </div>
    );
  }

  // ── Bubble style ────────────────────────────────────────────────────

  const bubbleClass = isOwn
    ? "bg-[#FFE600]/15 border border-[#FFE600]/30"
    : isAgent
      ? "bg-[#FFE600]/8 border-l-3 border-[#FFE600]"
      : "bg-[var(--surface)] border border-[var(--border)]";

  // ── Collapsible content ─────────────────────────────────────────────

  const isLong = message.content.length > COLLAPSE_THRESHOLD;
  const displayContent =
    isLong && !expanded
      ? message.content.slice(0, COLLAPSE_THRESHOLD) + "…"
      : message.content;

  // ── Aggregate reactions by emoji ────────────────────────────────────

  const reactions = message.reactions ?? [];

  return (
    <div
      role="article"
      aria-label={`Message from ${isAgent ? `${senderDisplayName}'s Yoodler` : senderDisplayName}`}
      className={`group flex flex-col ${isOwn ? "items-end" : "items-start"} ${showSender ? "mt-4" : "mt-0.5"}`}
    >
      {/* Sender info */}
      {showSender && (
        <div
          className={`flex items-center gap-2 mb-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
        >
          <Avatar
            src={message.sender.avatar}
            name={senderDisplayName}
            size="sm"
          />
          <span
            className="text-sm font-bold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-heading)",
            }}
          >
            {isAgent ? `${senderDisplayName}'s Yoodler 🤖` : senderDisplayName}
          </span>
        </div>
      )}

      {/* Bubble wrapper (relative for hover bar) */}
      <div
        className={`relative max-w-[75%] ${isOwn ? "ml-10" : "mr-10"}`}
        title={formatTime(message.createdAt)}
      >
        {/* Quick reaction bar (on hover) */}
        <div
          className={`absolute -top-8 ${isOwn ? "right-0" : "left-0"} z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-md px-1 py-0.5`}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              onClick={() => onReaction(message._id, emoji)}
              className="hover:scale-125 transition-transform px-0.5 text-sm cursor-pointer"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            aria-label="Reply to message"
            onClick={() => onReply(message)}
            className="ml-0.5 p-1 rounded hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <CornerUpLeft size={14} />
          </button>
        </div>

        {/* Bubble */}
        <div className={`rounded-xl px-3 py-2 ${bubbleClass}`}>
          {/* Reply preview */}
          {message.replyToMessage && (
            <div
              className="border-l-2 pl-2 mb-1 text-xs"
              style={{
                borderColor: "var(--text-muted)",
                color: "var(--text-muted)",
              }}
            >
              <span className="font-semibold">
                {message.replyToMessage.sender.name}
              </span>
              <p className="truncate">
                {truncate(message.replyToMessage.content, 60)}
              </p>
            </div>
          )}

          {/* Message content */}
          {message.deleted ? (
            <p
              className="text-sm italic"
              style={{ color: "var(--text-muted)" }}
            >
              This message was deleted
            </p>
          ) : (
            <>
              <div
                className="prose prose-sm prose-invert max-w-none"
                style={{ color: "var(--text-primary)" }}
              >
                <SafeMarkdown>{displayContent}</SafeMarkdown>
              </div>

              {isLong && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-xs mt-1 cursor-pointer hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}

              {message.edited && (
                <span
                  className="text-[10px] ml-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  (edited)
                </span>
              )}
            </>
          )}

          {/* Agent tool indicators */}
          {isAgent && message.agentMeta?.toolCalls && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.agentMeta.toolCalls.map((tc) => (
                <span
                  key={tc.name}
                  className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5"
                  style={{
                    backgroundColor: "var(--surface-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {tc.name}
                  {tc.status === "calling" && (
                    <Loader2 size={10} className="animate-spin" />
                  )}
                  {tc.status === "success" && (
                    <Check size={10} className="text-green-400" />
                  )}
                  {tc.status === "error" && (
                    <X size={10} className="text-red-400" />
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Agent action proposal */}
          {isAgent && message.agentMeta?.pendingAction && (
            <AgentActionCard
              action={message.agentMeta.pendingAction}
              messageId={message._id}
            />
          )}

          {/* Agent cards (meeting cascade, analytics, etc.) */}
          {isAgent && message.agentMeta?.cards && message.agentMeta.cards.length > 0 && (
            <div className="mt-1.5">
              <CardRenderer cards={message.agentMeta.cards as unknown as CardData[]} />
            </div>
          )}
        </div>

        {/* Reactions bar */}
        {reactions.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}
          >
            {reactions.map((r) => {
              const userReacted = r.users.includes(currentUserId);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  aria-label={`${r.emoji} reaction, ${r.users.length} ${r.users.length === 1 ? "person" : "people"}${userReacted ? ", you reacted" : ""}`}
                  onClick={() => onReaction(message._id, r.emoji)}
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs cursor-pointer transition-colors ${
                    userReacted ? "ring-1 ring-[#FFE600]" : ""
                  }`}
                  style={{ backgroundColor: "var(--surface-hover)" }}
                >
                  <span>{r.emoji}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {r.users.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Agent Action Card ─────────────────────────────────────────────────

interface AgentActionCardProps {
  action: {
    actionId: string;
    actionType: string;
    args: Record<string, unknown>;
    summary: string;
    status: string;
  };
  messageId: string;
}

function AgentActionCard({ action }: AgentActionCardProps) {
  const [status, setStatus] = useState<"pending" | "confirming" | "confirmed" | "denied" | "error">(
    (action.status as "pending") || "pending"
  );

  const handleConfirm = useCallback(async () => {
    setStatus("confirming");
    try {
      const res = await fetch("/api/ai/action/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actionType: action.actionType, args: action.args }),
      });
      if (res.ok) {
        setStatus("confirmed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, [action.actionType, action.args]);

  const handleRetry = useCallback(() => {
    setStatus("pending");
  }, []);

  const handleDeny = useCallback(() => {
    setStatus("denied");
  }, []);

  if (status === "denied") {
    return (
      <div className="mt-2 text-[10px] italic" style={{ color: "var(--text-muted)" }}>
        Action dismissed
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-lg p-3 border"
      style={{
        backgroundColor: "var(--surface-hover)",
        borderColor: status === "confirmed" ? "var(--success)" : "var(--border)",
      }}
    >
      <div className="flex items-start gap-2">
        <Zap size={14} className="mt-0.5 text-yellow-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            {action.summary}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {action.actionType.replace(/_/g, " ")}
          </p>
        </div>
      </div>
      {status === "pending" && (
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
            style={{ backgroundColor: "#FFE600", color: "#000" }}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={handleDeny}
            className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
            style={{ backgroundColor: "var(--surface)", color: "var(--text-secondary)" }}
          >
            Deny
          </button>
        </div>
      )}
      {status === "confirming" && (
        <div className="flex items-center justify-center gap-1 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={12} className="animate-spin" /> Running...
        </div>
      )}
      {status === "confirmed" && (
        <div className="flex items-center gap-1 mt-2 text-xs text-green-400">
          <Check size={12} /> Done
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-red-400 flex items-center gap-1">
            <X size={12} /> Failed
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="text-[10px] underline"
            style={{ color: "var(--text-muted)" }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

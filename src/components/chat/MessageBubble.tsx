"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { CornerUpLeft, Check, X, Loader2 } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import type { ChatMsg } from "@/hooks/useMessages";

// ── Extended message shape for future fields ────────────────────────────
// The base ChatMsg may be extended over time; we type the extras here.

interface AgentToolCall {
  name: string;
  status: "calling" | "success" | "error";
}

interface AgentMeta {
  toolCalls?: AgentToolCall[];
}

interface ExtendedChatMsg extends ChatMsg {
  senderType?: "user" | "agent" | "system";
  deleted?: boolean;
  edited?: boolean;
  agentMeta?: AgentMeta;
  replyToMessage?: {
    content: string;
    sender: { name: string };
  };
}

interface MessageBubbleProps {
  message: ExtendedChatMsg;
  isOwn: boolean;
  showSender: boolean;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ExtendedChatMsg) => void;
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
  const isSystem = senderType === "system";

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
      ? "bg-[#FFE600]/5 border-l-2 border-[#FFE600]"
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
            {isAgent ? `${senderDisplayName}'s Doodle 🤖` : senderDisplayName}
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
              onClick={() => onReaction(message._id, emoji)}
              className="hover:scale-125 transition-transform px-0.5 text-sm cursor-pointer"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
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
                <ReactMarkdown>{displayContent}</ReactMarkdown>
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

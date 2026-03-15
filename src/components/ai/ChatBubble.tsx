"use client";

import { motion } from "framer-motion";
import { Bot, User, Mail, Calendar, CheckSquare, Search, FileText, Users, Loader2, Check, X, ClipboardList } from "lucide-react";
import type { ToolCall } from "@/hooks/useAIChat";

interface ChatBubbleProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

/** Map tool names to human-readable labels and icons */
const TOOL_DISPLAY: Record<string, { label: string; icon: React.ElementType }> = {
  // Gmail
  send_email: { label: "Sending email", icon: Mail },
  search_emails: { label: "Searching emails", icon: Search },
  list_emails: { label: "Fetching emails", icon: Mail },
  get_unread_count: { label: "Checking unread count", icon: Mail },
  mark_email_read: { label: "Marking email as read", icon: Mail },
  get_email: { label: "Reading email", icon: Mail },
  reply_to_email: { label: "Replying to email", icon: Mail },
  // Calendar
  create_calendar_event: { label: "Creating calendar event", icon: Calendar },
  list_calendar_events: { label: "Listing calendar events", icon: Calendar },
  update_calendar_event: { label: "Updating calendar event", icon: Calendar },
  delete_calendar_event: { label: "Deleting calendar event", icon: Calendar },
  // Tasks
  create_task: { label: "Creating task", icon: CheckSquare },
  complete_task: { label: "Completing task", icon: CheckSquare },
  update_task: { label: "Updating task", icon: CheckSquare },
  delete_task: { label: "Deleting task", icon: CheckSquare },
  list_tasks: { label: "Listing tasks", icon: CheckSquare },
  list_task_lists: { label: "Listing task lists", icon: CheckSquare },
  // Drive
  search_drive_files: { label: "Searching Drive files", icon: FileText },
  list_drive_files: { label: "Listing Drive files", icon: FileText },
  create_google_doc: { label: "Creating Google Doc", icon: FileText },
  // Docs
  read_doc: { label: "Reading document", icon: FileText },
  append_to_doc: { label: "Appending to document", icon: FileText },
  find_replace_in_doc: { label: "Find & replace in doc", icon: FileText },
  // Sheets
  read_sheet: { label: "Reading spreadsheet", icon: FileText },
  write_sheet: { label: "Writing to spreadsheet", icon: FileText },
  append_to_sheet: { label: "Appending to spreadsheet", icon: FileText },
  create_spreadsheet: { label: "Creating spreadsheet", icon: FileText },
  clear_sheet_range: { label: "Clearing spreadsheet range", icon: FileText },
  // Contacts
  search_contacts: { label: "Searching contacts", icon: Users },
  // Memory
  save_memory: { label: "Saving context", icon: FileText },
  // Pending Actions
  propose_action: { label: "Proposing action", icon: CheckSquare },
};

function ToolCallIndicator({ toolCall }: { toolCall: ToolCall }) {
  const display = TOOL_DISPLAY[toolCall.name] || { label: toolCall.name, icon: Search };
  const Icon = display.icon;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-default)] text-xs"
    >
      <Icon size={12} className="shrink-0 text-[var(--text-secondary)]" />
      <span className="text-[var(--text-secondary)] truncate">
        {toolCall.status === "calling" ? (
          <>{display.label}…</>
        ) : toolCall.summary ? (
          toolCall.summary
        ) : (
          display.label
        )}
      </span>
      <span className="ml-auto shrink-0">
        {toolCall.status === "calling" && (
          <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" />
        )}
        {toolCall.status === "success" && (
          <Check size={12} className="text-green-500" />
        )}
        {toolCall.status === "error" && (
          <X size={12} className="text-red-500" />
        )}
      </span>
    </motion.div>
  );
}

export default function ChatBubble({ id, role, content, timestamp, isStreaming, toolCalls }: ChatBubbleProps) {
  const isAssistant = role === "assistant";
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const isBriefing = id?.startsWith("briefing-");

  // Briefing card — compact, left yellow border, no bubble shape
  if (isBriefing && isAssistant) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[90%]"
      >
        <div
          className="border-l-[3px] border-l-[#FFE600] rounded-lg bg-[var(--surface-elevated)] px-4 py-3"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <ClipboardList size={12} className="text-[#FFE600]" />
            <span
              className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Morning Briefing
            </span>
          </div>
          <div className="text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
            {content}
          </div>
          {timestamp && (
            <p className="text-[9px] text-[var(--text-muted)] mt-2">
              {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
          isAssistant
            ? "bg-[#FFE600] border-[var(--border-strong)]"
            : "bg-[var(--foreground)] border-[var(--border-strong)]"
        }`}
      >
        {isAssistant ? (
          <Bot size={14} className="text-[#0A0A0A]" />
        ) : (
          <User size={14} className="text-white" />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] ${isAssistant ? "" : "text-right"}`}>
        {/* Tool call indicators — shown above the message text */}
        {isAssistant && hasToolCalls && (
          <div className="flex flex-col gap-1 mb-1.5">
            {toolCalls.map((tc) => (
              <ToolCallIndicator key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <div
          className={`inline-block px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAssistant
              ? "bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-tl-md"
              : "bg-[#FFE600] text-[#0A0A0A] border-2 border-[var(--border-strong)] rounded-tr-md"
          }`}
          style={{ fontFamily: "var(--font-body)" }}
        >
          {content || (isStreaming && !hasToolCalls && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              Thinking…
            </motion.span>
          ))}
          {!content && isStreaming && hasToolCalls && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              Working on it…
            </motion.span>
          )}
        </div>
        {timestamp && (
          <p className={`text-[9px] text-[var(--text-muted)] mt-1 ${isAssistant ? "" : "text-right"}`}>
            {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </motion.div>
  );
}

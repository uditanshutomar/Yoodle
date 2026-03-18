// ── Shared types for the chat subsystem ──────────────────────────────

/** The sender classification for a chat message. */
export type SenderType = "user" | "agent" | "system";

/** A lightweight reference to the message that triggered an agent pipeline. */
export interface TriggerMessage {
  senderId: string;
  content: string;
  senderType?: SenderType;
}

/** The verdict returned by the ANALYZE+DECIDE stage of the agent pipeline. */
export type DecisionVerdict = "SILENT" | "UPDATE_MEMORY_ONLY" | "RESPOND";

// ── Conversation context item shapes ────────────────────────────────

export interface ActionItem {
  id: string;
  assignee: string;
  description: string;
  status: string;
  mentionedAt?: Date;
}

export interface OpenQuestion {
  id: string;
  question: string;
  askedBy: string;
  askedAt?: Date;
}

export interface Decision {
  description: string;
  madeAt?: Date;
  participants?: string[];
}

export interface Fact {
  content: string;
  mentionedBy: string;
  mentionedAt?: Date;
}

/** Snapshot of the running conversation context maintained by the REFLECT stage. */
export interface ConversationContextSnapshot {
  summary: string;
  actionItems: ActionItem[];
  decisions: Decision[];
  openQuestions: OpenQuestion[];
  facts: Fact[];
}

// ── Real-time chat events (discriminated union) ─────────────────────

export type ChatEvent =
  | { type: "agent_thinking"; agentId: string; name: string }
  | { type: "agent_thinking_done"; agentId: string }
  | { type: "message"; data: Record<string, unknown> };

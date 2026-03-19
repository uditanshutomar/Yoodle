# Chat & Agent Collaboration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full messaging system (DM + group chat) with Doodle agent participation and cross-agent collaboration, including all micro-interaction polish.

**Architecture:** MongoDB for persistence (Conversation + Message models), Redis pub/sub for real-time SSE streaming, agent processing via existing Gemini infrastructure. Chat UI lives at `/messages` and `/messages/[id]` inside the `(app)` route group.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose, Redis pub/sub, SSE (Server-Sent Events), Gemini AI (existing), Framer Motion, Tailwind v4, lucide-react icons.

---

## Phase 1: Data Models

### Task 1: Conversation Model

**Files:**
- Create: `src/lib/infra/db/models/conversation.ts`

**Step 1: Create the Conversation model**

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const CONVERSATION_TYPES = ["dm", "group"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export interface IConversationParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastReadAt?: Date;
  agentEnabled: boolean;
  muted: boolean;
  role: "admin" | "member";
}

export interface IConversation {
  type: ConversationType;
  name?: string; // Only for groups
  participants: IConversationParticipant[];
  pinnedMessageIds: Types.ObjectId[];
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageSenderId?: Types.ObjectId;
  meetingId?: Types.ObjectId; // Linked meeting (auto-created group)
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationDocument extends IConversation, Document {
  _id: Types.ObjectId;
}

const participantSchema = new Schema<IConversationParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date },
    agentEnabled: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversationDocument>(
  {
    type: { type: String, enum: CONVERSATION_TYPES, required: true },
    name: { type: String, trim: true },
    participants: { type: [participantSchema], required: true },
    pinnedMessageIds: [{ type: Schema.Types.ObjectId, ref: "DirectMessage" }],
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 100 },
    lastMessageSenderId: { type: Schema.Types.ObjectId, ref: "User" },
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "conversations" }
);

// Find conversations for a user, sorted by recent activity
conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
// Prevent duplicate DMs between same pair
conversationSchema.index(
  { type: 1, "participants.userId": 1 },
  { unique: true, partialFilterExpression: { type: "dm" } }
);

const Conversation: Model<IConversationDocument> =
  mongoose.models.Conversation ||
  mongoose.model<IConversationDocument>("Conversation", conversationSchema);

export default Conversation;
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/infra/db/models/conversation.ts
git commit -m "feat(chat): add Conversation model with participants and agent toggle"
```

---

### Task 2: DirectMessage Model

**Files:**
- Create: `src/lib/infra/db/models/direct-message.ts`

**Step 1: Create the DirectMessage model**

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const MESSAGE_TYPES = ["text", "system", "agent", "agent_channel"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface IReaction {
  emoji: string;
  userId: Types.ObjectId;
  createdAt: Date;
}

export interface IDirectMessage {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: "user" | "agent";
  content: string;
  type: MessageType;
  replyTo?: Types.ObjectId; // Thread reply
  reactions: IReaction[];
  edited: boolean;
  editedAt?: Date;
  deleted: boolean;
  // Agent-specific
  agentMeta?: {
    toolCalls?: { name: string; status: string; summary?: string }[];
    actions?: { label: string; action: string; payload?: Record<string, unknown> }[];
    forUserId?: Types.ObjectId; // Which user's agent sent this
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IDirectMessageDocument extends IDirectMessage, Document {
  _id: Types.ObjectId;
}

const reactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const directMessageSchema = new Schema<IDirectMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderType: { type: String, enum: ["user", "agent"], default: "user" },
    content: { type: String, required: true, maxlength: 4000 },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    replyTo: { type: Schema.Types.ObjectId, ref: "DirectMessage" },
    reactions: { type: [reactionSchema], default: [] },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date },
    deleted: { type: Boolean, default: false },
    agentMeta: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true, collection: "direct_messages" }
);

// Paginated messages in a conversation
directMessageSchema.index({ conversationId: 1, createdAt: -1 });
// Unread count query
directMessageSchema.index({ conversationId: 1, createdAt: 1, senderId: 1 });

const DirectMessage: Model<IDirectMessageDocument> =
  mongoose.models.DirectMessage ||
  mongoose.model<IDirectMessageDocument>("DirectMessage", directMessageSchema);

export default DirectMessage;
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/infra/db/models/direct-message.ts
git commit -m "feat(chat): add DirectMessage model with reactions, replies, agent metadata"
```

---

## Phase 2: Core API Routes

### Task 3: Conversations API (list + create)

**Files:**
- Create: `src/app/api/conversations/route.ts`

**Step 1: Create the conversations route**

Implements:
- `GET /api/conversations` — List user's conversations with unread counts, sorted by last activity
- `POST /api/conversations` — Create DM (by recipientId) or group (by name + participantIds)

Pattern: Follow `withHandler` + `authenticateRequest` + `successResponse` pattern from existing routes.

Key logic for GET:
```typescript
// Find conversations where user is a participant
const conversations = await Conversation.find({
  "participants.userId": userId,
})
  .sort({ lastMessageAt: -1 })
  .limit(50)
  .lean();

// For each, compute unread count
const withUnread = await Promise.all(
  conversations.map(async (conv) => {
    const participant = conv.participants.find(
      (p) => p.userId.toString() === userId
    );
    const unreadCount = participant?.lastReadAt
      ? await DirectMessage.countDocuments({
          conversationId: conv._id,
          createdAt: { $gt: participant.lastReadAt },
          senderId: { $ne: userId },
        })
      : await DirectMessage.countDocuments({
          conversationId: conv._id,
          senderId: { $ne: userId },
        });
    return { ...conv, unreadCount };
  })
);
```

Key logic for POST (DM):
```typescript
// Check for existing DM between these two users
const existing = await Conversation.findOne({
  type: "dm",
  "participants.userId": { $all: [userId, recipientId] },
  $expr: { $eq: [{ $size: "$participants" }, 2] },
});
if (existing) return successResponse(existing);
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/api/conversations/route.ts
git commit -m "feat(chat): add GET/POST /api/conversations for listing and creating chats"
```

---

### Task 4: Messages API (list + send)

**Files:**
- Create: `src/app/api/conversations/[id]/messages/route.ts`

**Step 1: Create the messages route**

Implements:
- `GET /api/conversations/[id]/messages?before=<cursor>&limit=30` — Paginated messages (cursor-based, newest first)
- `POST /api/conversations/[id]/messages` — Send a message

Key behaviors:
- On send: update conversation's `lastMessageAt`, `lastMessagePreview`, `lastMessageSenderId`
- On send: publish to Redis channel `chat:${conversationId}` for real-time delivery
- On send: if any participant has `agentEnabled: true`, queue agent processing
- Populate sender info (name, avatarUrl, status) on GET responses
- Support `replyTo` field for thread replies
- Return messages with sender populated: `{ _id, content, senderId: { _id, name, displayName, avatarUrl, status }, senderType, type, reactions, replyTo, edited, deleted, agentMeta, createdAt }`

**Step 2: Verify TypeScript compiles**

**Step 3: Commit**

```bash
git add src/app/api/conversations/[id]/messages/route.ts
git commit -m "feat(chat): add GET/POST messages with cursor pagination and Redis pub"
```

---

### Task 5: SSE Stream Endpoint

**Files:**
- Create: `src/app/api/conversations/[id]/stream/route.ts`

**Step 1: Create the SSE stream route**

Implements:
- `GET /api/conversations/[id]/stream` — SSE stream for real-time updates

Uses Redis pub/sub:
```typescript
export const GET = withHandler(async (req, context) => {
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  // Verify user is participant
  const conv = await Conversation.findOne({
    _id: id,
    "participants.userId": userId,
  });
  if (!conv) throw new NotFoundError("Conversation not found");

  const redis = getRedisClient();
  const subscriber = redis.duplicate();
  await subscriber.subscribe(`chat:${id}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      subscriber.on("message", (_channel, message) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe();
        subscriber.quit();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
```

Event types published to the channel:
- `{ type: "message", data: <populated message> }` — New message
- `{ type: "typing", userId, userName }` — Typing indicator
- `{ type: "read", userId, readAt }` — Read receipt
- `{ type: "reaction", messageId, reaction }` — Reaction added/removed
- `{ type: "agent_thinking", userId, agentName }` — Agent processing indicator

**Step 2: Commit**

```bash
git add src/app/api/conversations/[id]/stream/route.ts
git commit -m "feat(chat): add SSE stream endpoint with Redis pub/sub"
```

---

### Task 6: Supporting API Endpoints

**Files:**
- Create: `src/app/api/conversations/[id]/read/route.ts`
- Create: `src/app/api/conversations/[id]/typing/route.ts`
- Create: `src/app/api/conversations/[id]/reactions/route.ts`
- Create: `src/app/api/conversations/[id]/pin/route.ts`
- Create: `src/app/api/conversations/[id]/agent-toggle/route.ts`

**Step 1: Create read receipt endpoint**

`POST /api/conversations/[id]/read` — Updates `participant.lastReadAt` to now, publishes `read` event to Redis.

**Step 2: Create typing indicator endpoint**

`POST /api/conversations/[id]/typing` — Publishes `typing` event to Redis (no DB write).

**Step 3: Create reactions endpoint**

`POST /api/conversations/[id]/reactions` — Body: `{ messageId, emoji }`. Toggles reaction on/off. Publishes `reaction` event.

**Step 4: Create pin endpoint**

`POST /api/conversations/[id]/pin` — Body: `{ messageId }`. Toggles pin. Max 25 pinned per conversation.

**Step 5: Create agent toggle endpoint**

`PATCH /api/conversations/[id]/agent-toggle` — Body: `{ enabled: boolean }`. Updates participant's `agentEnabled`. When turning ON, triggers agent context entry (reads last 10 messages, posts contextual greeting).

**Step 6: Commit**

```bash
git add src/app/api/conversations/[id]/
git commit -m "feat(chat): add read receipts, typing, reactions, pin, agent toggle APIs"
```

---

## Phase 3: Agent Processing

### Task 7: Agent Message Processor

**Files:**
- Create: `src/lib/chat/agent-processor.ts`

**Step 1: Create the agent processor**

This module is called when a new message arrives in a conversation where participants have `agentEnabled: true`.

```typescript
import { streamChatWithAssistant } from "@/lib/ai/gemini";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import Conversation from "@/lib/infra/db/models/conversation";
import User from "@/lib/infra/db/models/user";
import { getRedisClient } from "@/lib/infra/redis/client";

export async function processAgentResponse(
  conversationId: string,
  triggerMessage: { senderId: string; content: string },
  agentUserId: string // The user whose agent should respond
) {
  const redis = getRedisClient();
  const user = await User.findById(agentUserId).lean();
  if (!user) return;

  // Publish "agent thinking" event
  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({
      type: "agent_thinking",
      userId: agentUserId,
      agentName: `${user.displayName}'s Doodle`,
    })
  );

  // Load last 15 messages for context
  const recentMessages = await DirectMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate("senderId", "name displayName")
    .lean();

  // Build conversation context for Gemini
  const history = recentMessages.reverse().map((m) => ({
    role: m.senderId.toString() === agentUserId ? "model" : "user",
    content: `[${(m.senderId as any).displayName || "User"}]: ${m.content}`,
  }));

  // Ask Gemini if agent should respond
  // (Uses a lightweight check prompt, not full tool-calling)
  const shouldRespond = await checkShouldRespond(history, triggerMessage.content, user.displayName);
  if (!shouldRespond) return;

  // Generate response using existing Gemini infrastructure
  const generator = streamChatWithAssistant(
    [{ role: "user", content: triggerMessage.content }],
    { /* user's workspace context */ },
    { systemInstruction: buildAgentChatPrompt(user.displayName) }
  );

  let fullResponse = "";
  const toolCalls: any[] = [];

  for await (const chunk of generator) {
    if (typeof chunk === "string") {
      fullResponse += chunk;
    } else if (chunk.type === "tool_call") {
      toolCalls.push({ name: chunk.name, status: "calling" });
    } else if (chunk.type === "tool_result") {
      const tc = toolCalls.find((t) => t.name === chunk.name && t.status === "calling");
      if (tc) {
        tc.status = chunk.success ? "success" : "error";
        tc.summary = chunk.summary;
      }
    }
  }

  if (!fullResponse.trim()) return;

  // Save agent message
  const agentMessage = await DirectMessage.create({
    conversationId,
    senderId: agentUserId,
    senderType: "agent",
    content: fullResponse,
    type: "agent",
    agentMeta: {
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      forUserId: agentUserId,
    },
  });

  // Update conversation
  await Conversation.updateOne(
    { _id: conversationId },
    {
      lastMessageAt: agentMessage.createdAt,
      lastMessagePreview: fullResponse.slice(0, 100),
      lastMessageSenderId: agentUserId,
    }
  );

  // Publish to SSE
  const populated = await DirectMessage.findById(agentMessage._id)
    .populate("senderId", "name displayName avatarUrl status")
    .lean();

  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({ type: "message", data: populated })
  );
}
```

**Step 2: Create `checkShouldRespond` helper**

Uses a lightweight Gemini call with a short prompt:
- "Given this conversation, should the user's assistant respond? Return YES or NO."
- Conditions to respond: directly asked, @mentioned, relevant to user's domain, scheduling request

**Step 3: Create `buildAgentChatPrompt` helper**

System prompt for agent in chat context (distinct from solo AI chat):
- "You are {name}'s Doodle assistant, participating in a group conversation."
- "Be concise. Don't repeat what's already been said."
- "If asked about {name}'s schedule/emails/tasks, use tools to check."
- "If you can't help, say so briefly."

**Step 4: Commit**

```bash
git add src/lib/chat/agent-processor.ts
git commit -m "feat(chat): add agent message processor with should-respond logic"
```

---

### Task 8: Cross-Agent Collaboration

**Files:**
- Create: `src/lib/chat/agent-channel.ts`

**Step 1: Create the agent channel**

Handles agent-to-agent requests (invisible to users):

```typescript
export interface AgentRequest {
  intent: string; // "find_available_time" | "check_email" | "get_task_status" etc.
  fromUserId: string;
  toUserId: string;
  payload: Record<string, unknown>;
  conversationId: string;
}

export interface AgentResponse {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export async function sendAgentRequest(request: AgentRequest): Promise<AgentResponse> {
  // Load target user's workspace context
  // Execute a Gemini call with the request intent + payload
  // Return structured response
}
```

Supported intents:
- `find_available_time` — Check a user's calendar for free slots
- `check_email_status` — Check if user has unread emails on a topic
- `get_task_status` — Check user's task list for a specific item
- `share_document` — Find and share a Drive file

**Step 2: Add agent collaboration tools to tools.ts**

Add new Gemini function declarations:
```typescript
{
  name: "request_agent_collaboration",
  description: "Ask another participant's Doodle assistant for information (e.g., check their calendar, tasks)",
  parameters: {
    type: "object",
    properties: {
      targetUserName: { type: "string", description: "The name of the user whose agent to contact" },
      intent: { type: "string", enum: ["find_available_time", "check_email_status", "get_task_status"] },
      details: { type: "string", description: "Specific details for the request" },
    },
    required: ["targetUserName", "intent", "details"],
  },
},
{
  name: "send_chat_message",
  description: "Send a message in the current conversation",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "The message to send" },
    },
    required: ["content"],
  },
}
```

**Step 3: Commit**

```bash
git add src/lib/chat/agent-channel.ts src/lib/ai/tools.ts
git commit -m "feat(chat): add cross-agent collaboration channel and new Gemini tools"
```

---

## Phase 4: Chat UI — Core Components

### Task 9: useChat Hook (not the meeting one — rename existing)

**Files:**
- Create: `src/hooks/useMessages.ts`

**Step 1: Create the useMessages hook**

```typescript
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "./useAuth";

export interface MessageSender {
  _id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  status?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  createdAt: string;
}

export interface ChatMsg {
  _id: string;
  conversationId: string;
  senderId: MessageSender;
  senderType: "user" | "agent";
  content: string;
  type: "text" | "system" | "agent" | "agent_channel";
  replyTo?: ChatMsg;
  reactions: Reaction[];
  edited: boolean;
  deleted: boolean;
  agentMeta?: {
    toolCalls?: { name: string; status: string; summary?: string }[];
    actions?: { label: string; action: string }[];
    forUserId?: string;
  };
  createdAt: string;
}

export interface ConversationInfo {
  _id: string;
  type: "dm" | "group";
  name?: string;
  participants: {
    userId: { _id: string; name: string; displayName: string; avatarUrl?: string; status?: string };
    agentEnabled: boolean;
    muted: boolean;
    role: string;
    lastReadAt?: string;
  }[];
  unreadCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Fetch messages (cursor-based pagination)
  const fetchMessages = useCallback(async (before?: string) => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (before) params.set("before", before);
      const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.data?.messages || [];
      setMessages((prev) => before ? [...msgs, ...prev] : msgs);
      setHasMore(msgs.length === 30);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // SSE connection
  useEffect(() => {
    if (!conversationId || !user) return;

    const es = new EventSource(`/api/conversations/${conversationId}/stream`, {
      withCredentials: true,
    });

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        switch (parsed.type) {
          case "message":
            setMessages((prev) => [...prev, parsed.data]);
            break;
          case "typing":
            if (parsed.userId !== user.id) {
              setTypingUsers((prev) => new Map(prev).set(parsed.userId, parsed.userName));
              // Clear after 3s
              const existing = typingTimeoutRef.current.get(parsed.userId);
              if (existing) clearTimeout(existing);
              typingTimeoutRef.current.set(
                parsed.userId,
                setTimeout(() => {
                  setTypingUsers((prev) => {
                    const next = new Map(prev);
                    next.delete(parsed.userId);
                    return next;
                  });
                }, 3000)
              );
            }
            break;
          case "read":
            // Could update read indicators
            break;
          case "reaction":
            setMessages((prev) =>
              prev.map((m) =>
                m._id === parsed.messageId
                  ? { ...m, reactions: parsed.reactions }
                  : m
              )
            );
            break;
          case "agent_thinking":
            // Add temporary typing indicator for agent
            setTypingUsers((prev) =>
              new Map(prev).set(`agent-${parsed.userId}`, `${parsed.agentName}`)
            );
            break;
        }
      } catch { /* skip malformed */ }
    };

    eventSourceRef.current = es;
    return () => {
      es.close();
      typingTimeoutRef.current.forEach((t) => clearTimeout(t));
    };
  }, [conversationId, user]);

  // Load initial messages
  useEffect(() => {
    if (conversationId) {
      setMessages([]);
      setHasMore(true);
      fetchMessages();
    }
  }, [conversationId, fetchMessages]);

  // Send message
  const sendMessage = useCallback(async (content: string, replyTo?: string) => {
    if (!conversationId || !content.trim()) return;
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: content.trim(), replyTo }),
    });
  }, [conversationId]);

  // Send typing indicator
  const sendTyping = useCallback(async () => {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [conversationId]);

  // Toggle reaction
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ messageId, emoji }),
    });
  }, [conversationId]);

  // Mark as read
  const markAsRead = useCallback(async () => {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [conversationId]);

  // Load more (older messages)
  const loadMore = useCallback(() => {
    if (messages.length > 0 && hasMore) {
      fetchMessages(messages[0]._id);
    }
  }, [messages, hasMore, fetchMessages]);

  return {
    messages,
    loading,
    hasMore,
    typingUsers,
    sendMessage,
    sendTyping,
    toggleReaction,
    markAsRead,
    loadMore,
  };
}
```

**Step 2: Create `useConversations` hook**

**Files:**
- Create: `src/hooks/useConversations.ts`

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "./useAuth";

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchConversations();
  }, [user, fetchConversations]);

  // Poll every 10s for unread updates
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [user, fetchConversations]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const createDM = useCallback(async (recipientId: string) => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: "dm", recipientId }),
    });
    const data = await res.json();
    if (data.success) {
      await fetchConversations();
      return data.data._id;
    }
    return null;
  }, [fetchConversations]);

  const createGroup = useCallback(async (name: string, participantIds: string[]) => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: "group", name, participantIds }),
    });
    const data = await res.json();
    if (data.success) {
      await fetchConversations();
      return data.data._id;
    }
    return null;
  }, [fetchConversations]);

  return { conversations, loading, totalUnread, createDM, createGroup, refresh: fetchConversations };
}
```

**Step 3: Commit**

```bash
git add src/hooks/useMessages.ts src/hooks/useConversations.ts
git commit -m "feat(chat): add useMessages and useConversations hooks with SSE real-time"
```

---

### Task 10: ConversationList Component

**Files:**
- Create: `src/components/chat/ConversationList.tsx`

**Step 1: Build the conversation list**

Features:
- Shows all conversations sorted by last activity
- DM: shows other user's avatar + name
- Group: shows group name + participant count
- Unread count badge (yellow circle with count)
- Last message preview in secondary text, truncated
- "Last seen" / time since last message (e.g., "2m", "1h", "Yesterday")
- Active conversation highlighted
- "New Message" button at top (opens user search modal)
- Online/offline dot on avatars
- Search/filter input at top

Styling: Match existing card/nav patterns — `bg-[var(--surface)]`, `border-2 border-[var(--border)]`, `rounded-xl`, yellow accent for active.

**Step 2: Commit**

```bash
git add src/components/chat/ConversationList.tsx
git commit -m "feat(chat): add ConversationList with unread badges and online indicators"
```

---

### Task 11: MessageBubble Component

**Files:**
- Create: `src/components/chat/MessageBubble.tsx`

**Step 1: Build the message bubble**

Features:
- **Sender differentiation:**
  - Own messages: right-aligned, yellow-ish background
  - Other user messages: left-aligned, surface background
  - Agent messages: left-aligned, subtle yellow-tinted background (`bg-[#FFE600]/5 border-l-2 border-[#FFE600]`)
  - System messages: centered, muted text, no bubble

- **Avatar + name:** Show sender avatar + name above first message in consecutive run from same sender. Don't repeat for sequential messages from same person.

- **Markdown rendering:** Reuse `ReactMarkdown` + `prose prose-sm prose-invert` pattern from ChatBubble.tsx

- **Reactions bar:** Compact row of emoji pills below message. Each shows emoji + count. Click to toggle own reaction. Long-press or hover shows who reacted.

- **Reply preview:** If message has `replyTo`, show a compact quoted block above the message content with the replied-to text truncated to 1 line.

- **Agent tool indicators:** If `agentMeta.toolCalls` exists, show animated pills (reuse pattern from ChatBubble.tsx tool call display).

- **Agent action buttons:** If `agentMeta.actions` exists, render inline buttons (e.g., "[Create Event] [Suggest Another Time]").

- **Timestamp logic:**
  - Show time divider when gap > 10 minutes between messages
  - Show date divider ("Today", "Yesterday", "March 14") when date changes
  - Individual message timestamp on hover (tooltip)

- **Message states:**
  - `edited`: show "(edited)" label after content
  - `deleted`: show "This message was deleted" in italic muted text

- **Long message collapse:** Messages > 6 lines get collapsed with "Show more" toggle

- **Quick reaction picker:** On hover, show a small floating bar with 5 most common emojis (👍 ❤️ 😂 🔥 👀) + "+" for full picker

**Step 2: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat(chat): add MessageBubble with reactions, replies, agent styling, timestamps"
```

---

### Task 12: ChatThread Component

**Files:**
- Create: `src/components/chat/ChatThread.tsx`

**Step 1: Build the chat thread**

This is the main chat view — header + message list + input.

**Header:**
- DM: other user's avatar, name, status ("Online", "Last seen 5m ago")
- Group: group name, participant count, expand to see members
- Agent toggle button (brain icon, toggles yellow when active)
- Pinned messages banner (collapsible, shows pinned message count + previews)

**Message list:**
- Infinite scroll up for older messages (calls `loadMore`)
- Auto-scroll to bottom on new messages (unless user has scrolled up)
- "Jump to bottom" floating button with unread count when scrolled up
- Unread separator line: yellow line with "X new messages" when entering a conversation with unreads
- Typing indicator at bottom: shows animated dots with user's avatar when someone is typing. Agent typing shows Doodle mascot with a thinking animation.

**Input area:**
- Auto-growing textarea (1-5 lines)
- Enter to send, Shift+Enter for newline
- Reply mode: when replying, show quoted preview above input with X to cancel
- @mention autocomplete: typing "@" shows dropdown of participants (+ "@Doodle" option)
- Send button: morphs from disabled gray → yellow when text is present
- Character count when > 3500 chars (limit 4000)
- Typing indicator: debounced, fires `sendTyping` after 500ms of typing, max once every 2s

**Step 2: Commit**

```bash
git add src/components/chat/ChatThread.tsx
git commit -m "feat(chat): add ChatThread with auto-scroll, typing indicators, @mentions"
```

---

### Task 13: New Message Modal + User Search

**Files:**
- Create: `src/components/chat/NewMessageModal.tsx`

**Step 1: Build the new message modal**

Features:
- Search input with debounced fetch to `/api/users/search`
- Shows user results with avatar, name, displayName, status
- Click to start a DM (navigates to `/messages/[id]`)
- "Create Group" tab: multi-select users, enter group name
- Recently chatted users shown by default (from conversations list)

**Step 2: Commit**

```bash
git add src/components/chat/NewMessageModal.tsx
git commit -m "feat(chat): add NewMessageModal with user search and group creation"
```

---

## Phase 5: Pages + Navigation

### Task 14: Messages Pages

**Files:**
- Create: `src/app/(app)/messages/page.tsx`
- Create: `src/app/(app)/messages/[id]/page.tsx`
- Create: `src/app/(app)/messages/layout.tsx`

**Step 1: Create messages layout**

Split-pane layout:
- Left: ConversationList (hidden on mobile when conversation is open)
- Right: ChatThread (full-screen on mobile)

```typescript
// src/app/(app)/messages/layout.tsx
"use client";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-4 -my-6 lg:-mx-8">
      {children}
    </div>
  );
}
```

**Step 2: Create messages index page**

```typescript
// src/app/(app)/messages/page.tsx
"use client";

import { useRouter } from "next/navigation";
import ConversationList from "@/components/chat/ConversationList";

export default function MessagesPage() {
  const router = useRouter();
  return (
    <div className="flex h-full w-full">
      <ConversationList
        onSelect={(id) => router.push(`/messages/${id}`)}
        className="w-full lg:w-80 lg:border-r-2 lg:border-[var(--border)]"
      />
      {/* Desktop: show empty state */}
      <div className="hidden lg:flex flex-1 items-center justify-center text-[var(--text-muted)]">
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Select a conversation
          </p>
          <p className="text-sm mt-1">Or start a new one</p>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create conversation detail page**

```typescript
// src/app/(app)/messages/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import ConversationList from "@/components/chat/ConversationList";
import ChatThread from "@/components/chat/ChatThread";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="flex h-full w-full">
      <ConversationList
        activeId={id}
        onSelect={(cid) => router.push(`/messages/${cid}`)}
        className="hidden lg:flex lg:w-80 lg:border-r-2 lg:border-[var(--border)]"
      />
      <ChatThread
        conversationId={id}
        onBack={() => router.push("/messages")}
        className="flex-1"
      />
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/\(app\)/messages/
git commit -m "feat(chat): add /messages pages with split-pane layout"
```

---

### Task 15: Add Messages to Sidebar Navigation

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`

**Step 1: Add Messages nav item with unread badge**

Add to `navItems` array (insert after "Dashboard"):
```typescript
import { MessageSquare } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  // ... rest
];
```

Add unread badge to the Messages nav item:
```tsx
{item.label === "Messages" && totalUnread > 0 && (
  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFE600] px-1.5 text-xs font-bold text-[#0A0A0A] border border-[#0A0A0A]">
    {totalUnread > 99 ? "99+" : totalUnread}
  </span>
)}
```

Need to import and use `useConversations` hook at the top level, or pass `totalUnread` as context. Best approach: create a lightweight `useTotalUnread` hook that only fetches the count (lightweight polling to `/api/conversations/unread-count`).

**Step 2: Create unread count API**

**Files:**
- Create: `src/app/api/conversations/unread-count/route.ts`

Simple endpoint that returns total unread count across all conversations for the current user.

**Step 3: Create useTotalUnread hook**

**Files:**
- Create: `src/hooks/useTotalUnread.ts`

Polls unread count every 15s. Returns `{ totalUnread: number }`.

**Step 4: Commit**

```bash
git add src/components/layout/AppSidebar.tsx src/app/api/conversations/unread-count/route.ts src/hooks/useTotalUnread.ts
git commit -m "feat(chat): add Messages to sidebar with live unread count badge"
```

---

## Phase 6: Polish & Micro-interactions

### Task 16: Presence System

**Files:**
- Create: `src/lib/chat/presence.ts`
- Modify: `src/components/ui/Avatar.tsx` (add pulsing online dot)

**Step 1: Create presence utilities**

Use Redis to track online/offline status:
- On page load: `SET presence:${userId} online EX 30`
- Heartbeat every 20s: refresh the TTL
- On disconnect: key auto-expires
- Query: `GET presence:${userId}` → online or null (offline)

Also derive "in meeting" and "DND" from user's `status` field in DB.

"Last seen" logic:
- If online: show "Online" with pulsing green dot
- If `status === "in-meeting"`: show "In a meeting" with yellow dot
- If `status === "dnd"`: show "Do Not Disturb" with red dot
- Else: show "Last seen Xm/Xh ago" from `lastSeenAt` field

**Step 2: Update Avatar component**

Add pulsing animation to online dot:
```tsx
{status === "online" && (
  <span className={`absolute ${s.dotPos} ${s.dot} rounded-full border-2 border-white`}>
    <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-40" />
    <span className="absolute inset-0 rounded-full bg-green-400" />
  </span>
)}
```

**Step 3: Commit**

```bash
git add src/lib/chat/presence.ts src/components/ui/Avatar.tsx
git commit -m "feat(chat): add presence system with pulsing online indicators"
```

---

### Task 17: DND Auto-Reply

**Files:**
- Modify: `src/lib/chat/agent-processor.ts`

**Step 1: Add DND auto-reply logic**

When a message is sent to a user who is in DND/focus mode AND has agentEnabled:
```typescript
// In processAgentResponse, before the normal agent flow:
const targetUser = await User.findById(agentUserId).lean();
if (targetUser?.status === "dnd") {
  // Auto-reply without full Gemini call
  const autoReply = `${targetUser.displayName} is in focus mode right now. I'll make sure they see your message when they're back! 🎯`;
  // Save and publish this message
  // Skip the normal agent processing
  return;
}
```

**Step 2: Commit**

```bash
git add src/lib/chat/agent-processor.ts
git commit -m "feat(chat): add DND auto-reply when user is in focus mode"
```

---

### Task 18: @Doodle Mention Trigger

**Files:**
- Modify: `src/app/api/conversations/[id]/messages/route.ts`

**Step 1: Add @Doodle mention detection**

In the POST handler, after saving the message:
```typescript
// Check for @Doodle mention — activates agent for single response
// even if agentEnabled is false
const mentionsDoodle = content.toLowerCase().includes("@doodle");
if (mentionsDoodle) {
  // Find all participants (or the sender's own agent)
  // Trigger a one-shot agent response
  const participant = conversation.participants.find(
    (p) => p.userId.toString() === userId
  );
  await processAgentResponse(id, { senderId: userId, content }, userId);
}
```

**Step 2: Commit**

```bash
git add src/app/api/conversations/[id]/messages/route.ts
git commit -m "feat(chat): @Doodle mention triggers one-shot agent response"
```

---

### Task 19: Meeting Integration — Auto-Create Group Chat

**Files:**
- Modify: `src/app/api/meetings/[id]/join/route.ts` (or wherever meeting start logic is)

**Step 1: Auto-create or find group chat when meeting starts**

After a meeting is created with 2+ participants:
```typescript
// Check if conversation linked to this meeting exists
let conv = await Conversation.findOne({ meetingId: meeting._id });
if (!conv) {
  conv = await Conversation.create({
    type: "group",
    name: `Meeting: ${meeting.title || meeting.meetingCode}`,
    participants: attendees.map((a) => ({
      userId: a.userId,
      role: a.userId === meeting.hostId ? "admin" : "member",
    })),
    meetingId: meeting._id,
    createdBy: meeting.hostId,
  });
}

// Post system message
await DirectMessage.create({
  conversationId: conv._id,
  senderId: meeting.hostId,
  senderType: "user",
  content: "Meeting started",
  type: "system",
});
```

**Step 2: Post MoM to group chat after meeting ends**

When meeting ends and has a transcript/summary:
```typescript
await DirectMessage.create({
  conversationId: conv._id,
  senderId: meeting.hostId,
  senderType: "agent",
  content: meetingSummary,
  type: "agent",
  agentMeta: {
    forUserId: meeting.hostId,
  },
});
```

**Step 3: Commit**

```bash
git add src/app/api/meetings/
git commit -m "feat(chat): auto-create group chat for meetings, post MoM on end"
```

---

### Task 20: Link Previews + Inline Meeting Cards

**Files:**
- Create: `src/components/chat/LinkPreview.tsx`
- Create: `src/components/chat/MeetingCard.tsx`
- Create: `src/app/api/link-preview/route.ts`

**Step 1: Create link preview component**

Detects URLs in messages, fetches OG metadata via a lightweight API endpoint, renders a compact card with image + title + description.

Special handling:
- Google Docs/Sheets/Slides links → show doc icon + title
- Yoodle meeting links → render `MeetingCard` (joinable inline card with time, participants, "Join" button)

**Step 2: Create link preview API**

`GET /api/link-preview?url=...` — Fetches the URL server-side, extracts `<meta property="og:*">` tags, returns `{ title, description, image, siteName }`.

**Step 3: Create MeetingCard**

Inline card showing:
- Meeting title/code
- Time (if scheduled)
- Participant avatars (max 4 + "+X")
- "Join Meeting" button → navigates to meeting page

**Step 4: Commit**

```bash
git add src/components/chat/LinkPreview.tsx src/components/chat/MeetingCard.tsx src/app/api/link-preview/route.ts
git commit -m "feat(chat): add link previews and inline meeting cards"
```

---

### Task 21: Emoji Reaction Picker

**Files:**
- Create: `src/components/chat/EmojiPicker.tsx`

**Step 1: Build lightweight emoji picker**

Two modes:
1. **Quick bar** (on hover): 5 most common emojis — 👍 ❤️ 😂 🔥 👀 — plus a "+" button
2. **Full picker** (on "+" click): Categorized grid of ~200 common emojis

No heavy dependency. Just a curated list organized by category (Smileys, Gestures, Hearts, Objects, Flags).

**Step 2: Commit**

```bash
git add src/components/chat/EmojiPicker.tsx
git commit -m "feat(chat): add lightweight emoji picker with quick bar and full grid"
```

---

### Task 22: Message Search

**Files:**
- Create: `src/app/api/conversations/[id]/search/route.ts`
- Create: `src/components/chat/MessageSearch.tsx`

**Step 1: Create search API**

`GET /api/conversations/[id]/search?q=...` — Text search within a conversation using MongoDB `$text` index (or regex fallback).

Returns matching messages with surrounding context (1 message before/after each hit).

**Step 2: Create search UI**

Slide-in panel from the right. Shows:
- Search input
- Results count ("12 messages found")
- Each result: message preview with highlighted match + timestamp
- Click result → scrolls to that message in the thread (highlight flash animation)

**Step 3: Add text index to DirectMessage**

```typescript
directMessageSchema.index({ content: "text" });
```

**Step 4: Commit**

```bash
git add src/app/api/conversations/[id]/search/route.ts src/components/chat/MessageSearch.tsx src/lib/infra/db/models/direct-message.ts
git commit -m "feat(chat): add message search with highlighted results"
```

---

### Task 23: Shared Media Panel

**Files:**
- Create: `src/components/chat/SharedMediaPanel.tsx`
- Create: `src/app/api/conversations/[id]/media/route.ts`

**Step 1: Create media API**

`GET /api/conversations/[id]/media?type=links|files|images` — Returns all shared links, files, or images from messages in a conversation. Extracts URLs from message content using regex.

**Step 2: Create media panel UI**

Tabbed panel (Links | Files | Images) showing shared content chronologically. Each item shows:
- Links: favicon + title + domain + who shared + when
- Images: thumbnail grid
- Files: file icon + name + size + who shared + when

**Step 3: Commit**

```bash
git add src/components/chat/SharedMediaPanel.tsx src/app/api/conversations/[id]/media/route.ts
git commit -m "feat(chat): add shared media panel with links, files, images tabs"
```

---

## Phase 7: Final Polish

### Task 24: Notification Toast for New Messages

**Files:**
- Modify: `src/hooks/useTotalUnread.ts`

**Step 1: Add toast notification**

When a new message arrives while user is on a different page, show a toast (using existing `sonner` library):

```typescript
import { toast } from "sonner";

// In the polling logic, detect count increase
if (newCount > prevCount) {
  toast(`New message from ${senderName}`, {
    description: messagePreview,
    action: {
      label: "View",
      onClick: () => router.push(`/messages/${conversationId}`),
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/useTotalUnread.ts
git commit -m "feat(chat): add toast notifications for new messages"
```

---

### Task 25: Mute Conversation

**Files:**
- Create: `src/app/api/conversations/[id]/mute/route.ts`

**Step 1: Create mute endpoint**

`PATCH /api/conversations/[id]/mute` — Body: `{ muted: boolean }`. Updates participant's `muted` field. Muted conversations don't trigger toasts or increment unread badge.

**Step 2: Add mute button to ChatThread header**

Bell icon with slash when muted. Tooltip: "Mute notifications" / "Unmute".

**Step 3: Commit**

```bash
git add src/app/api/conversations/[id]/mute/route.ts src/components/chat/ChatThread.tsx
git commit -m "feat(chat): add conversation mute/unmute"
```

---

### Task 26: Final Build Verification + Deploy

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

**Step 2: Run ESLint**

Run: `npx next lint`
Expected: 0 errors (or only warnings)

**Step 3: Run build**

Run: `npx next build`
Expected: Build succeeds

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from chat feature"
```

**Step 5: Push and deploy**

```bash
git push origin main
```

---

## Summary

| Phase | Tasks | What it builds |
|-------|-------|----------------|
| 1 | 1-2 | Data models (Conversation, DirectMessage) |
| 2 | 3-6 | Core API routes (CRUD, SSE stream, reactions, typing) |
| 3 | 7-8 | Agent processing + cross-agent collaboration |
| 4 | 9-13 | Chat UI components (hooks, list, bubbles, thread, modal) |
| 5 | 14-15 | Pages + sidebar navigation with unread badge |
| 6 | 16-23 | Polish (presence, DND, @Doodle, meetings, links, search) |
| 7 | 24-26 | Notifications, mute, build verification, deploy |

Total: 26 tasks across 7 phases.

# Messages + AI Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Yoodle messaging into an AI-powered collaboration hub with personal agents ("Yoodlers") per user, cross-domain intelligence (calendar, tasks, meetings, Drive), and rate-limited proactive behaviors.

**Architecture:** Extend the existing 5-stage agent pipeline in `agent-processor.ts` to support multiple personal agents per conversation with named routing. Add 6 new AI tools to `tools.ts`. Enhance GATHER and REFLECT stages for cross-domain awareness. Add a proactive message system with Redis-backed rate limiting that fires from meeting/task lifecycle hooks.

**Tech Stack:** Next.js App Router, MongoDB/Mongoose, Redis pub/sub, Gemini AI (via `@google/generative-ai`), Vitest, TypeScript

---

## Task 1: Schema Changes — Conversation Participant Agent Fields

Add `agentMutedUntil` to participant schema so users can mute their agent's proactive messages per conversation.

**Files:**
- Modify: `src/lib/infra/db/models/conversation.ts:6-13` (IConversationParticipant interface)
- Modify: `src/lib/infra/db/models/conversation.ts:39-49` (participantSchema)

**Step 1: Update the IConversationParticipant interface**

In `src/lib/infra/db/models/conversation.ts`, add `agentMutedUntil` to the interface at line 12:

```typescript
export interface IConversationParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastReadAt?: Date;
  agentEnabled: boolean;
  muted: boolean;
  agentMutedUntil?: Date;
  role: "admin" | "member";
}
```

**Step 2: Update the participant Mongoose schema**

Add the field to `participantSchema` (line 39-49):

```typescript
const participantSchema = new Schema<IConversationParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date },
    agentEnabled: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    agentMutedUntil: { type: Date },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { _id: false }
);
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/infra/db/models/conversation.ts
git commit -m "feat(models): add agentMutedUntil to conversation participant schema"
```

---

## Task 2: Schema Changes — DirectMessage New Fields

Add `priority` and `meetingContext` fields to DirectMessage for priority detection and in-meeting chat persistence.

**Files:**
- Modify: `src/lib/infra/db/models/direct-message.ts:12-37` (IDirectMessage interface)
- Modify: `src/lib/infra/db/models/direct-message.ts:52-74` (directMessageSchema)

**Step 1: Update the IDirectMessage interface**

Add two new optional fields after line 22 (`deleted: boolean`):

```typescript
export interface IDirectMessage {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: "user" | "agent";
  content: string;
  type: MessageType;
  replyTo?: Types.ObjectId;
  reactions: IReaction[];
  edited: boolean;
  editedAt?: Date;
  deleted: boolean;
  priority?: "high" | "normal";
  meetingContext?: boolean;
  agentMeta?: {
    toolCalls?: { name: string; status: string; summary?: string }[];
    actions?: { label: string; action: string; payload?: Record<string, unknown> }[];
    forUserId?: Types.ObjectId;
    pendingAction?: {
      actionId: string;
      actionType: string;
      args: Record<string, unknown>;
      summary: string;
      status: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Step 2: Update the Mongoose schema**

Add the fields to `directMessageSchema` after the `deleted` field (around line 68):

```typescript
    deleted: { type: Boolean, default: false },
    priority: { type: String, enum: ["high", "normal"], default: "normal" },
    meetingContext: { type: Boolean },
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/infra/db/models/direct-message.ts
git commit -m "feat(models): add priority and meetingContext fields to DirectMessage"
```

---

## Task 3: Schema Changes — ConversationContext Linked IDs

Add `linkedTaskIds` and `linkedMeetingIds` arrays to ConversationContext for cross-reference tracking between conversations and tasks/meetings discussed in them.

**Files:**
- Modify: `src/lib/infra/db/models/conversation-context.ts:31-41` (IConversationContext interface)
- Modify: `src/lib/infra/db/models/conversation-context.ts:93-110` (conversationContextSchema)

**Step 1: Update the IConversationContext interface**

Add after `facts` (line 37):

```typescript
export interface IConversationContext {
  conversationId: Types.ObjectId;
  summary: string;
  actionItems: IActionItem[];
  decisions: IDecision[];
  openQuestions: IOpenQuestion[];
  facts: IFact[];
  linkedTaskIds: Types.ObjectId[];
  linkedMeetingIds: Types.ObjectId[];
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**Step 2: Update the Mongoose schema**

Add after `facts` field in `conversationContextSchema` (around line 106):

```typescript
    facts: { type: [factSchema], default: [] },
    linkedTaskIds: [{ type: Schema.Types.ObjectId, ref: "Task" }],
    linkedMeetingIds: [{ type: Schema.Types.ObjectId, ref: "Meeting" }],
    lastUpdatedAt: { type: Date, default: Date.now },
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/infra/db/models/conversation-context.ts
git commit -m "feat(models): add linkedTaskIds and linkedMeetingIds to ConversationContext"
```

---

## Task 4: Multi-Agent Routing — Personal Agent Naming

Update the agent processor to use "{DisplayName}'s Yoodler" naming (instead of "{Name}'s Doodle") and update the message routing to handle named agent addressing.

**Files:**
- Modify: `src/lib/chat/agent-processor.ts:40-60` (processAgentResponses)
- Modify: `src/lib/chat/agent-processor.ts:64-73` (processOneAgent guards)
- Modify: `src/lib/chat/agent-processor.ts:117-125` (agent_thinking event)
- Modify: `src/lib/chat/agent-processor.ts:255-261` (REFLECT stage agent name)
- Modify: `src/app/api/conversations/[id]/messages/route.ts:164-170` (agent trigger)

**Step 1: Update agent naming in processOneAgent**

In `agent-processor.ts`, change the `agent_thinking` event (line 121-124) from `${userName}'s Doodle` to `${userName}'s Yoodler`:

```typescript
    await redis.publish(
      `chat:${conversationId}`,
      JSON.stringify({
        type: "agent_thinking",
        agentId: agentUserId,
        name: `${userName}'s Yoodler`,
      })
    );
```

**Step 2: Update the REFLECT stage agent label**

At line 259, change the agent label:

```typescript
      ...(response?.trim() ? [`[${userName}'s Yoodler]: ${response.trim()}`] : []),
```

**Step 3: Keep agent-to-agent guard as-is**

Currently line 73 blocks ALL agent messages (`if (triggerMessage.senderType === "agent") return;`). Keep this for now — agent-to-agent responses are risky. The personal agent model works because each agent only responds when its owner is addressed or the conversation context is relevant.

**Step 4: Update message endpoint agent trigger to pass senderType**

In `src/app/api/conversations/[id]/messages/route.ts`, the fire-and-forget call at line 167-169 should pass senderType:

```typescript
    processAgentResponses(id, { senderId: userId, content, senderType: "user" }).catch(() => {});
```

**Step 5: Update buildRespondPrompt name reference**

In `src/lib/ai/prompts.ts`, line 216:

```typescript
  return `You are ${userName}'s Yoodler — a sharp, helpful teammate in a group chat on Yoodle.
```

And line 263:

```typescript
Respond naturally as ${userName}'s agent. Just the message text, no prefix like "Agent:" or "Yoodler:".`;
```

Also update line 136 in buildAnalyzeAndDecidePrompt:

```typescript
  return `You are ${userName}'s Yoodler agent in a ${conversationType} on Yoodle. Analyze the conversation and decide whether to respond.
```

**Step 6: Update SYSTEM_PROMPTS.ASSISTANT_CHAT agent reference**

In `src/lib/ai/prompts.ts`, lines 77-80, update:

```
Agent Collaboration:
- Each user has their own Yoodler agent. User data is PRIVATE by default.
- In group chats, multiple users may have their Yoodler active — each responds only for their owner.
- Only share what your user has explicitly authorized.
- Your name is "{User's name}'s Yoodler" — use it when referencing yourself.
```

**Step 7: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 8: Run existing tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx vitest run src/lib/chat/__tests__/agent-processor.test.ts 2>&1 | tail -10`
Expected: All tests pass

**Step 9: Commit**

```bash
git add src/lib/chat/agent-processor.ts src/lib/ai/prompts.ts "src/app/api/conversations/[id]/messages/route.ts"
git commit -m "feat(agent): rename agents to Yoodler, update multi-agent routing"
```

---

## Task 5: Proactive Message Rate Limiter

Create a Redis-backed rate limiter for proactive agent messages. This is the foundation for all proactive behaviors (deadline reminders, follow-up nudges, meeting prep, etc.).

**Files:**
- Create: `src/lib/chat/proactive-limiter.ts`

**Step 1: Create the rate limiter module**

```typescript
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("proactive-limiter");

/**
 * Rate limiter for proactive agent messages.
 *
 * Global cap: 3 proactive messages per agent per conversation per day.
 * Per-type caps: 1 per type per agent per conversation per day.
 *
 * Keys:
 *   proactive:{conversationId}:{agentUserId}:global  - counter (TTL 24h)
 *   proactive:{conversationId}:{agentUserId}:{type}   - "1" (TTL 24h)
 */

const GLOBAL_CAP = 3;
const TTL_SECONDS = 86400; // 24 hours

export type ProactiveType =
  | "deadline_reminder"
  | "follow_up_nudge"
  | "meeting_prep"
  | "blocked_task_alert"
  | "weekly_digest"
  | "task_status";

/**
 * Check whether a proactive message of the given type is allowed.
 * If allowed, increments counters and returns true.
 * If rate-limited, returns false.
 */
export async function canSendProactive(
  conversationId: string,
  agentUserId: string,
  type: ProactiveType
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const globalKey = `proactive:${conversationId}:${agentUserId}:global`;
    const typeKey = `proactive:${conversationId}:${agentUserId}:${type}`;

    // Check type cap first (cheaper)
    const typeUsed = await redis.exists(typeKey);
    if (typeUsed) {
      log.info({ conversationId, agentUserId, type }, "Proactive message rate-limited (type cap)");
      return false;
    }

    // Check global cap
    const globalCount = await redis.get(globalKey);
    if (globalCount && parseInt(globalCount, 10) >= GLOBAL_CAP) {
      log.info({ conversationId, agentUserId, type }, "Proactive message rate-limited (global cap)");
      return false;
    }

    // Increment global counter and set type flag atomically via pipeline
    const pipe = redis.pipeline();
    pipe.incr(globalKey);
    pipe.expire(globalKey, TTL_SECONDS);
    pipe.set(typeKey, "1", "EX", TTL_SECONDS);
    await pipe.exec();

    return true;
  } catch (err) {
    log.warn({ err, conversationId, agentUserId, type }, "Rate limiter error - allowing message");
    return true; // Fail open
  }
}

/**
 * Check if user has muted proactive messages for this conversation.
 * Returns true if muted (should NOT send).
 */
export async function isAgentMuted(
  conversationId: string,
  agentUserId: string
): Promise<boolean> {
  try {
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const conv = await Conversation.findOne(
      {
        _id: conversationId,
        "participants.userId": agentUserId,
      },
      { "participants.$": 1 }
    ).lean();

    if (!conv?.participants?.[0]) return false;
    const participant = conv.participants[0];
    if (!participant.agentMutedUntil) return false;
    return new Date(participant.agentMutedUntil) > new Date();
  } catch {
    return false; // Fail open
  }
}
```

**Step 2: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/chat/proactive-limiter.ts
git commit -m "feat(chat): add proactive message rate limiter with per-type and global caps"
```

---

## Task 6: New AI Tool — summarize_conversation

Add a tool that lets the agent summarize conversation history on demand.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add declaration + executor)

**Step 1: Add tool declaration**

In `src/lib/ai/tools.ts`, add to `WORKSPACE_TOOLS.functionDeclarations` array (before the closing `]`):

```typescript
    // -- Conversation Intelligence ------------------------------------
    {
      name: "summarize_conversation",
      description:
        "Summarize a conversation's history. Use when the user asks 'summarize this chat', 'what did we discuss', or 'catch me up'. Returns conversation context including summary, decisions, action items, and recent messages.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          conversationId: {
            type: SchemaType.STRING,
            description: "The conversation ID to summarize. Use the current conversation ID.",
          },
          depth: {
            type: SchemaType.STRING,
            description: "'quick' for last 20 messages, 'full' for entire history. Default: 'quick'.",
          },
        },
        required: ["conversationId"],
      },
    },
```

**Step 2: Add executor case**

In the `executeWorkspaceTool` switch statement, add:

```typescript
    case "summarize_conversation": {
      await connectDB();
      const ConversationContext = (await import("@/lib/infra/db/models/conversation-context")).default;
      const DirectMessageModel = (await import("@/lib/infra/db/models/direct-message")).default;
      const ConversationModel = (await import("@/lib/infra/db/models/conversation")).default;

      const convId = args.conversationId as string;
      const depth = (args.depth as string) || "quick";

      // Verify user is a participant
      const conv = await ConversationModel.findById(convId).lean();
      if (!conv) return { success: false, summary: "Conversation not found." };
      const isParticipant = conv.participants.some(
        (p: { userId: { toString(): string } }) => p.userId.toString() === userId
      );
      if (!isParticipant) return { success: false, summary: "You are not a participant in this conversation." };

      // Get conversation context
      const ctx = await ConversationContext.findOne({ conversationId: convId }).lean();

      // Get messages
      const limit = depth === "full" ? 200 : 20;
      const messages = await DirectMessageModel.find({ conversationId: convId, deleted: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("senderId", "displayName name")
        .lean();

      const msgSummary = messages.reverse().map((m: Record<string, unknown>) => {
        const sender = m.senderId as { displayName?: string; name?: string } | null;
        const name = sender?.displayName || sender?.name || "Unknown";
        const date = new Date(m.createdAt as string).toLocaleDateString();
        return `[${date}] ${name}: ${(m.content as string).slice(0, 150)}`;
      }).join("\n");

      const contextSummary = ctx ? {
        summary: ctx.summary,
        openActionItems: ctx.actionItems?.filter((a: { status: string }) => a.status === "open").length || 0,
        decisions: ctx.decisions?.length || 0,
        openQuestions: ctx.openQuestions?.length || 0,
        actionItems: ctx.actionItems?.filter((a: { status: string }) => a.status === "open")
          .map((a: { description: string; assignee: string }) => `${a.description} (${a.assignee})`),
      } : null;

      return {
        success: true,
        summary: `Conversation summary (${depth}, ${messages.length} messages)`,
        data: { context: contextSummary, recentMessages: msgSummary },
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(tools): add summarize_conversation tool"
```

---

## Task 7: New AI Tool — search_messages

Add a tool for semantic message search across the user's conversations using MongoDB text index (already exists on DirectMessage.content).

**Files:**
- Modify: `src/lib/ai/tools.ts` (add declaration + executor)

**Step 1: Add tool declaration**

```typescript
    {
      name: "search_messages",
      description:
        "Search across the user's conversation messages by keyword. Use when the user asks 'find where we discussed X', 'search for messages about Y', or needs to find a past conversation topic.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: "Search keywords to find in message content.",
          },
          conversationId: {
            type: SchemaType.STRING,
            description: "Optional: limit search to a specific conversation. Omit to search all user's conversations.",
          },
          limit: {
            type: SchemaType.NUMBER,
            description: "Max results to return. Default: 10.",
          },
        },
        required: ["query"],
      },
    },
```

**Step 2: Add executor case**

```typescript
    case "search_messages": {
      await connectDB();
      const DirectMessageModel = (await import("@/lib/infra/db/models/direct-message")).default;
      const ConversationModel = (await import("@/lib/infra/db/models/conversation")).default;

      const query = args.query as string;
      const maxResults = Math.min((args.limit as number) || 10, 20);

      // Get all conversation IDs where user is a participant
      const userConvs = await ConversationModel.find(
        { "participants.userId": new mongoose.Types.ObjectId(userId) },
        { _id: 1 }
      ).lean();
      const convIds = userConvs.map((c: { _id: unknown }) => c._id);

      const filter: Record<string, unknown> = {
        conversationId: args.conversationId
          ? new mongoose.Types.ObjectId(args.conversationId as string)
          : { $in: convIds },
        deleted: false,
        $text: { $search: query },
      };

      const messages = await DirectMessageModel.find(
        filter,
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(maxResults)
        .populate("senderId", "displayName name")
        .populate("conversationId", "name type")
        .lean();

      const results = messages.map((m: Record<string, unknown>) => {
        const sender = m.senderId as { displayName?: string; name?: string } | null;
        const conv = m.conversationId as { name?: string; type?: string } | null;
        return {
          content: (m.content as string).slice(0, 200),
          sender: sender?.displayName || sender?.name || "Unknown",
          conversation: conv?.name || (conv?.type === "dm" ? "DM" : "Group"),
          date: m.createdAt,
        };
      });

      return {
        success: true,
        summary: `Found ${results.length} messages matching "${query}"`,
        data: results,
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(tools): add search_messages tool with text search"
```

---

## Task 8: New AI Tool — generate_standup

Add a tool that compiles a daily standup summary from tasks, meetings, and blockers.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add declaration + executor)

**Step 1: Add tool declaration**

```typescript
    {
      name: "generate_standup",
      description:
        "Generate a daily standup summary. Shows tasks completed yesterday, tasks in progress today, and blockers. Use when user asks for 'standup', 'daily update', or 'what did I do yesterday'.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: {
            type: SchemaType.STRING,
            description: "User ID to generate standup for. Defaults to the requesting user.",
          },
          boardId: {
            type: SchemaType.STRING,
            description: "Optional: limit to a specific board.",
          },
        },
        required: [],
      },
    },
```

**Step 2: Add executor case**

```typescript
    case "generate_standup": {
      await connectDB();
      const targetUserId = (args.userId as string) || userId;

      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const boardFilter: Record<string, unknown> = {};
      if (args.boardId) {
        boardFilter.boardId = new mongoose.Types.ObjectId(args.boardId as string);
      }

      // Tasks completed yesterday
      const completedYesterday = await Task.find({
        ...boardFilter,
        assigneeId: new mongoose.Types.ObjectId(targetUserId),
        completedAt: { $gte: yesterday, $lt: todayStart },
      }).select("title boardId").lean();

      // Tasks in progress (not completed, assigned to user)
      const inProgress = await Task.find({
        ...boardFilter,
        assigneeId: new mongoose.Types.ObjectId(targetUserId),
        completedAt: null,
        columnId: { $exists: true },
      }).select("title priority dueDate boardId columnId").sort({ dueDate: 1 }).limit(10).lean();

      // Overdue tasks (blockers)
      const overdue = await Task.find({
        ...boardFilter,
        assigneeId: new mongoose.Types.ObjectId(targetUserId),
        completedAt: null,
        dueDate: { $lt: now },
      }).select("title priority dueDate").lean();

      return {
        success: true,
        summary: `Standup: ${completedYesterday.length} done yesterday, ${inProgress.length} in progress, ${overdue.length} overdue`,
        data: {
          completedYesterday: completedYesterday.map((t) => t.title),
          inProgress: inProgress.map((t) => ({
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
          })),
          blockers: overdue.map((t) => ({
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
          })),
        },
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(tools): add generate_standup tool"
```

---

## Task 9: New AI Tool — conversation_insights

Add a tool that analyzes a conversation and surfaces unresolved questions, decisions, and open action items.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add declaration + executor)

**Step 1: Add tool declaration**

```typescript
    {
      name: "conversation_insights",
      description:
        "Analyze a conversation and surface insights: unresolved questions, decisions made, open action items not yet converted to tasks, and topic distribution. Use when user asks 'what's open in this chat?', 'any unresolved items?', or 'what decisions did we make?'.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          conversationId: {
            type: SchemaType.STRING,
            description: "The conversation ID to analyze.",
          },
        },
        required: ["conversationId"],
      },
    },
```

**Step 2: Add executor case**

```typescript
    case "conversation_insights": {
      await connectDB();
      const ConversationContext = (await import("@/lib/infra/db/models/conversation-context")).default;
      const ConversationModel = (await import("@/lib/infra/db/models/conversation")).default;

      const convId = args.conversationId as string;

      // Verify participation
      const conv = await ConversationModel.findById(convId).lean();
      if (!conv) return { success: false, summary: "Conversation not found." };
      const isParticipant = conv.participants.some(
        (p: { userId: { toString(): string } }) => p.userId.toString() === userId
      );
      if (!isParticipant) return { success: false, summary: "Not a participant." };

      const ctx = await ConversationContext.findOne({ conversationId: convId }).lean();
      if (!ctx) return { success: true, summary: "No conversation context yet.", data: {} };

      return {
        success: true,
        summary: "Conversation insights retrieved",
        data: {
          summary: ctx.summary,
          unresolvedQuestions: ctx.openQuestions || [],
          decisions: ctx.decisions || [],
          openActionItems: (ctx.actionItems || []).filter(
            (a: { status: string }) => a.status === "open"
          ),
          totalFacts: (ctx.facts || []).length,
          lastUpdated: ctx.lastUpdatedAt,
        },
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(tools): add conversation_insights tool"
```

---

## Task 10: New AI Tool — translate_message

Add a tool for on-demand message translation using Gemini.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add declaration + executor)

**Step 1: Add tool declaration**

```typescript
    {
      name: "translate_message",
      description:
        "Translate a message to a different language. Use when the user asks to translate a message or when a non-primary-language message is detected.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          text: {
            type: SchemaType.STRING,
            description: "The text to translate.",
          },
          targetLanguage: {
            type: SchemaType.STRING,
            description: "Target language (e.g., 'Spanish', 'French', 'Japanese', 'Hindi').",
          },
        },
        required: ["text", "targetLanguage"],
      },
    },
```

**Step 2: Add executor case**

```typescript
    case "translate_message": {
      const { getModel } = await import("@/lib/ai/gemini");
      const model = getModel();
      const text = args.text as string;
      const targetLang = args.targetLanguage as string;

      const result = await model.generateContent(
        `Translate the following text to ${targetLang}. Return ONLY the translated text, no explanations.\n\nText: ${text}`
      );
      const translated = result.response.text()?.trim() || "";

      return {
        success: true,
        summary: `Translated to ${targetLang}`,
        data: { original: text, translated, targetLanguage: targetLang },
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(tools): add translate_message tool"
```

---

## Task 11: New AI Tool — suggest_mentions

Add a tool that suggests relevant people to @mention based on conversation context.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add declaration + executor)

**Step 1: Add tool declaration**

```typescript
    {
      name: "suggest_mentions",
      description:
        "Suggest relevant people to mention based on conversation topic. Use when the user discusses a topic and relevant people should be looped in.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          topic: {
            type: SchemaType.STRING,
            description: "The topic or context to find relevant people for.",
          },
          conversationId: {
            type: SchemaType.STRING,
            description: "Current conversation ID for participant context.",
          },
        },
        required: ["topic"],
      },
    },
```

**Step 2: Add executor case**

```typescript
    case "suggest_mentions": {
      await connectDB();
      const topic = args.topic as string;
      const topicLower = topic.toLowerCase();

      // Search tasks related to the topic
      const relatedTasks = await Task.find({
        $or: [
          { title: { $regex: topicLower, $options: "i" } },
          { description: { $regex: topicLower, $options: "i" } },
        ],
        completedAt: null,
      })
        .select("assigneeId creatorId title")
        .populate("assigneeId", "displayName name email")
        .populate("creatorId", "displayName name email")
        .limit(10)
        .lean();

      // Collect unique users from tasks
      const userMap = new Map<string, { name: string; email: string; reason: string }>();
      for (const task of relatedTasks) {
        const assignee = task.assigneeId as { _id: { toString(): string }; displayName?: string; name?: string; email?: string } | null;
        const creator = task.creatorId as { _id: { toString(): string }; displayName?: string; name?: string; email?: string } | null;

        if (assignee && assignee._id.toString() !== userId) {
          const id = assignee._id.toString();
          if (!userMap.has(id)) {
            userMap.set(id, {
              name: assignee.displayName || assignee.name || "Unknown",
              email: assignee.email || "",
              reason: `Assigned to "${task.title}"`,
            });
          }
        }
        if (creator && creator._id.toString() !== userId) {
          const id = creator._id.toString();
          if (!userMap.has(id)) {
            userMap.set(id, {
              name: creator.displayName || creator.name || "Unknown",
              email: creator.email || "",
              reason: `Created "${task.title}"`,
            });
          }
        }
      }

      // Also search meetings related to topic
      const relatedMeetings = await Meeting.find({
        title: { $regex: topicLower, $options: "i" },
        status: { $in: ["scheduled", "active", "ended"] },
      })
        .select("participants title")
        .limit(5)
        .lean();

      for (const meeting of relatedMeetings) {
        for (const p of meeting.participants || []) {
          const pId = p.userId.toString();
          if (pId !== userId && !userMap.has(pId)) {
            const u = await User.findById(pId).select("displayName name email").lean();
            if (u) {
              userMap.set(pId, {
                name: u.displayName || u.name || "Unknown",
                email: u.email || "",
                reason: `Attended meeting "${meeting.title}"`,
              });
            }
          }
        }
      }

      const suggestions = Array.from(userMap.values()).slice(0, 5);

      return {
        success: true,
        summary: `${suggestions.length} people related to "${topic}"`,
        data: suggestions,
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat(tools): add suggest_mentions tool"
```

---

## Task 12: Whitelist New Tools in Action Confirm Route

Add the new tools to the allowed action types whitelist.

**Files:**
- Modify: `src/app/api/ai/action/confirm/route.ts:10-26` (ALLOWED_ACTION_TYPES)

**Step 1: Add new tools to whitelist**

Add to the `ALLOWED_ACTION_TYPES` Set:

```typescript
  // Conversation intelligence
  "summarize_conversation",
  "search_messages",
  "generate_standup",
  "conversation_insights",
  "translate_message",
  "suggest_mentions",
  "create_tasks_from_meeting",
```

**Step 2: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add "src/app/api/ai/action/confirm/route.ts"
git commit -m "feat(api): whitelist new conversation intelligence tools in action confirm"
```

---

## Task 13: Enhanced GATHER Stage — Context-Aware Responses

Enhance the GATHER stage to automatically fetch relevant tasks, calendar events, and meeting notes when the agent responds, based on conversation context.

**Files:**
- Modify: `src/lib/chat/agent-tools.ts` (enhance executeToolPlan)
- Modify: `src/lib/chat/agent-processor.ts` (pass conversationId)

**Step 1: Add conversationId parameter to executeToolPlan**

In `src/lib/chat/agent-tools.ts`, update the function signature:

```typescript
export async function executeToolPlan(
  userId: string,
  toolPlan: string[],
  timezone?: string,
  conversationId?: string
): Promise<GatheredData>
```

At the end of `executeToolPlan`, after all tools are processed (before the final `return data`), add conversation enrichment:

```typescript
    // Enrich with conversation-linked data
    if (conversationId) {
      try {
        const ConversationContext = (await import("@/lib/infra/db/models/conversation-context")).default;
        const ctx = await ConversationContext.findOne({ conversationId }).lean();
        if (ctx) {
          const openItems = (ctx.actionItems || [])
            .filter((a: { status: string }) => a.status === "open")
            .map((a: { description: string; assignee: string }) => `  - ${a.description} (${a.assignee})`)
            .join("\n");
          if (openItems) {
            data.tasks = (data.tasks || "") + `\n\n--- Open Action Items from this Conversation ---\n${openItems}`;
          }

          const linkedMeetingIds = ctx.linkedMeetingIds || [];
          if (linkedMeetingIds.length > 0) {
            const MeetingModel = (await import("@/lib/infra/db/models/meeting")).default;
            const recentMeetings = await MeetingModel.find({
              _id: { $in: linkedMeetingIds },
            }).select("title mom endedAt").sort({ endedAt: -1 }).limit(3).lean();

            const meetingNotes = recentMeetings
              .filter((m: { mom?: { summary?: string } }) => m.mom?.summary)
              .map((m: { title?: string; mom?: { summary?: string } }) =>
                `  - ${m.title}: ${m.mom?.summary?.slice(0, 150)}`
              ).join("\n");
            if (meetingNotes) {
              data.calendar = (data.calendar || "") + `\n\n--- Recent Meeting Notes (linked to this chat) ---\n${meetingNotes}`;
            }
          }
        }
      } catch {
        // Non-fatal enrichment
      }
    }
```

**Step 2: Pass conversationId from agent-processor to executeToolPlan**

In `src/lib/chat/agent-processor.ts`, line 217, update the call:

```typescript
    const gatheredData = await executeToolPlan(agentUserId, toolPlan, userTimezone, conversationId);
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Run existing tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx vitest run src/lib/chat/__tests__/agent-tools.test.ts 2>&1 | tail -10`
Expected: Tests pass (new param is optional, existing calls still work)

**Step 5: Commit**

```bash
git add src/lib/chat/agent-tools.ts src/lib/chat/agent-processor.ts
git commit -m "feat(agent): enhance GATHER stage with conversation-linked tasks and meeting notes"
```

---

## Task 14: Post-Meeting Action Extraction

When a meeting ends, the host's agent analyzes the MoM and proposes creating tasks for each action item.

**Files:**
- Modify: `src/app/api/meetings/[meetingId]/leave/route.ts:150-266` (post-meeting section)
- Modify: `src/lib/ai/tools.ts` (add create_tasks_from_meeting executor)

**Step 1: Add action item extraction after MoM posting**

In the fire-and-forget async block in leave/route.ts, after step 2 (Post MoM, around line 242), add step 3 for action extraction. Renumber existing step 3 (calendar update) to step 4:

```typescript
      // 3. Extract action items from MoM and propose tasks (independent of steps 1 & 2)
      try {
        if (meetingWithMom?.mom?.actionItems?.length) {
          const actionItems = meetingWithMom.mom.actionItems;

          const taskProposals = actionItems.map(
            (a: { task: string; owner: string; due: string }) =>
              `- **${a.task}** -> ${a.owner} (due: ${a.due})`
          ).join("\n");

          const proposalContent = [
            `**Action Items from "${meetingWithMom.title}"**`,
            "",
            "I detected these action items from the meeting:",
            taskProposals,
            "",
            "Would you like me to create tasks for these?",
          ].join("\n");

          const proposalMsg = await DirectMessage.create({
            conversationId: convId,
            senderId: result.hostId,
            senderType: "agent",
            content: proposalContent,
            type: "agent",
            agentMeta: {
              forUserId: result.hostId,
              pendingAction: {
                actionId: `action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                actionType: "create_tasks_from_meeting",
                args: {
                  meetingId: result._id.toString(),
                  actionItems: actionItems,
                },
                summary: `Create ${actionItems.length} tasks from meeting "${meetingWithMom.title}"`,
                status: "pending",
              },
            },
          });

          await Conversation.updateOne(
            { _id: convId },
            {
              $set: {
                lastMessageAt: proposalMsg.createdAt,
                lastMessagePreview: "Action items detected from meeting",
                lastMessageSenderId: proposalMsg.senderId,
              },
            },
          );

          try {
            const redis = getRedisClient();
            await redis.publish(`chat:${convId}`, JSON.stringify({ type: "message", message: proposalMsg }));
          } catch { /* Redis optional */ }
        }
      } catch (err) {
        log.warn({ err, meetingId: result._id }, "failed to extract action items from meeting");
      }
```

**Step 2: Add the batch task creation executor to tools.ts**

```typescript
    case "create_tasks_from_meeting": {
      await connectDB();
      const Board = (await import("@/lib/infra/db/models/board")).default;
      const meetingId = args.meetingId as string;
      const actionItems = args.actionItems as { task: string; owner: string; due: string }[];

      // Find personal board
      const board = await Board.findOne({
        creatorId: new mongoose.Types.ObjectId(userId),
        type: "personal",
      }).lean();
      if (!board) {
        return { success: false, summary: "No personal board found." };
      }
      const firstColumn = board.columns?.[0]?.id;

      const createdTasks = [];
      for (const item of actionItems) {
        const dueDate = item.due && item.due !== "N/A" ? new Date(item.due) : undefined;
        const task = await Task.create({
          title: item.task,
          boardId: board._id,
          columnId: firstColumn,
          creatorId: new mongoose.Types.ObjectId(userId),
          assigneeId: new mongoose.Types.ObjectId(userId),
          meetingId: new mongoose.Types.ObjectId(meetingId),
          priority: "medium",
          ...(dueDate && !isNaN(dueDate.getTime()) ? { dueDate } : {}),
        });
        createdTasks.push(task.title);
      }

      return {
        success: true,
        summary: `Created ${createdTasks.length} tasks from meeting`,
        data: { tasks: createdTasks },
      };
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add "src/app/api/meetings/[meetingId]/leave/route.ts" src/lib/ai/tools.ts
git commit -m "feat(meetings): extract action items from MoM and propose task creation"
```

---

## Task 15: Proactive Triggers — Meeting Prep, Deadline Reminders, Follow-ups, Blocked Tasks

Create the proactive triggers module with all four trigger functions.

**Files:**
- Create: `src/lib/chat/proactive-triggers.ts`

**Step 1: Create the proactive triggers module**

This is a large file. Create `src/lib/chat/proactive-triggers.ts` with four exported functions:
- `triggerMeetingPrep()` — posts meeting prep 15 min before scheduled meetings
- `triggerDeadlineReminders()` — reminds about tasks due within 24h
- `triggerFollowUpNudges()` — nudges for meeting action items not started after 48h
- `triggerBlockedTaskAlerts()` — alerts for tasks with no updates in 3+ days

Each function:
1. Queries the relevant data (meetings/tasks)
2. Finds linked conversations with agent-enabled participants
3. Checks rate limits via `canSendProactive()` and mute status via `isAgentMuted()`
4. Creates a DirectMessage with `senderType: "agent"` and publishes via Redis

See the design doc (`docs/plans/2026-03-17-messages-ai-integration-design.md`, Section E) for the exact message formats and trigger conditions.

The full implementation should follow the patterns established in `leave/route.ts` for posting agent messages:
- `DirectMessage.create({ conversationId, senderId, senderType: "agent", content, type: "agent", agentMeta: { forUserId } })`
- `Conversation.updateOne({ _id }, { $set: { lastMessageAt, lastMessagePreview, lastMessageSenderId } })`
- `redis.publish('chat:${convId}', JSON.stringify({ type: "message", message }))`

**Step 2: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts
git commit -m "feat(chat): add proactive triggers for meeting prep, deadline reminders, follow-ups, and blocked task alerts"
```

---

## Task 16: Proactive Triggers API Endpoint

Create an API endpoint that can be called by a cron job (or Vercel Cron) to fire all proactive triggers.

**Files:**
- Create: `src/app/api/cron/proactive/route.ts`

**Step 1: Create the cron endpoint**

```typescript
import { NextRequest } from "next/server";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("cron:proactive");

/**
 * POST /api/cron/proactive
 *
 * Fires all proactive agent triggers. Intended to be called every 5 minutes
 * by Vercel Cron or an external scheduler.
 *
 * Secured by CRON_SECRET header check.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const {
      triggerMeetingPrep,
      triggerDeadlineReminders,
      triggerFollowUpNudges,
      triggerBlockedTaskAlerts,
    } = await import("@/lib/chat/proactive-triggers");

    const results = await Promise.allSettled([
      triggerMeetingPrep(),
      triggerDeadlineReminders(),
      triggerFollowUpNudges(),
      triggerBlockedTaskAlerts(),
    ]);

    const summary = results.map((r, i) => {
      const names = ["meetingPrep", "deadlineReminders", "followUpNudges", "blockedTaskAlerts"];
      return { trigger: names[i], status: r.status };
    });

    log.info({ summary }, "Proactive triggers completed");
    return Response.json({ ok: true, summary });
  } catch (err) {
    log.error({ err }, "Proactive cron failed");
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
```

**Step 2: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/cron/proactive/route.ts
git commit -m "feat(api): add proactive triggers cron endpoint"
```

---

## Task 17: Enhanced REFLECT Stage — Auto-Detect Action Items

Enhance the REFLECT stage to automatically detect action items in messages and flag them for task creation.

**Files:**
- Modify: `src/lib/ai/prompts.ts:266-297` (buildReflectPrompt)
- Modify: `src/lib/chat/agent-processor.ts` (runReflect function)

**Step 1: Enhance the reflect prompt**

Update `buildReflectPrompt` in `src/lib/ai/prompts.ts` to add `taskWorthy` detection to the output schema:

Add `"taskWorthy":[{"title":"Send API docs","assignee":"John","dueHint":"Friday","reason":"Explicit commitment with deadline"}]` to the example output.

Add this guidance:

```
taskWorthy items that should become board tasks:
- Look for explicit commitments: "I'll do X by Y", "Can you handle Z", "Let's make sure W happens"
- Must have a clear deliverable and ideally an owner
- Include dueHint if a time reference is found ("by Friday", "next week", "end of month")
- Do NOT include vague items or general discussion topics
```

**Step 2: Handle taskWorthy items in runReflect**

In `agent-processor.ts`, in the `runReflect` function, after processing the reflect response, add:

```typescript
    const taskWorthy = reflectResult.taskWorthy || [];
    if (taskWorthy.length > 0) {
      log.info({ conversationId, taskWorthy: taskWorthy.length }, "Task-worthy items detected");
      const taskFacts = taskWorthy.map((tw: { title: string; assignee: string; reason: string }) => ({
        content: `[TASK-WORTHY] ${tw.title} assigned to ${tw.assignee}. ${tw.reason}`,
        mentionedBy: "system",
        mentionedAt: new Date(),
      }));
      await ConversationContext.updateOne(
        { conversationId },
        { $push: { facts: { $each: taskFacts, $slice: -15 } } }
      );
    }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Run existing tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx vitest run src/lib/chat/__tests__/agent-processor.test.ts 2>&1 | tail -10`
Expected: Tests pass

**Step 5: Commit**

```bash
git add src/lib/ai/prompts.ts src/lib/chat/agent-processor.ts
git commit -m "feat(agent): detect task-worthy items in REFLECT stage for automatic action item extraction"
```

---

## Task 18: In-Meeting Chat Persistence + Priority Detection

Tag messages sent during an active meeting with `meetingContext: true` and detect high-priority messages.

**Files:**
- Modify: `src/app/api/conversations/[id]/messages/route.ts` (POST handler)

**Step 1: Add priority detection utility**

At the top of the route file, add:

```typescript
const URGENCY_PATTERNS = /\b(asap|urgent|blocking|blocked|critical|deadline today|deadline tomorrow|p0|p1|emergency|immediately)\b/i;

function detectPriority(content: string): "high" | "normal" {
  return URGENCY_PATTERNS.test(content) ? "high" : "normal";
}
```

**Step 2: Add meeting context detection and priority to message creation**

Before message creation, check for active meeting:

```typescript
    let isActiveMeeting = false;
    if (conversation.meetingId) {
      const MeetingModel = (await import("@/lib/infra/db/models/meeting")).default;
      const meeting = await MeetingModel.findById(conversation.meetingId).select("status").lean();
      isActiveMeeting = meeting?.status === "active";
    }

    const priority = detectPriority(content);
```

Update message creation:

```typescript
    const message = await DirectMessage.create({
      conversationId: new mongoose.Types.ObjectId(id),
      senderId: new mongoose.Types.ObjectId(userId),
      senderType: "user",
      type: "text",
      content: content.trim(),
      priority,
      ...(replyTo ? { replyTo: new mongoose.Types.ObjectId(replyTo) } : {}),
      ...(isActiveMeeting ? { meetingContext: true } : {}),
    });
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add "src/app/api/conversations/[id]/messages/route.ts"
git commit -m "feat(messages): add in-meeting chat tagging and priority detection"
```

---

## Task 19: Task Status Notifications in Conversations

When a task linked to a conversation changes status, post a notification in that conversation.

**Files:**
- Create: `src/lib/chat/task-notifications.ts`

**Step 1: Create the task notification helper**

```typescript
import mongoose from "mongoose";
import connectDB from "@/lib/infra/db/client";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import { canSendProactive, isAgentMuted } from "@/lib/chat/proactive-limiter";

const log = createLogger("task-notifications");

/**
 * Post a task status change notification to linked conversations.
 * Call this from task update endpoints when status changes.
 */
export async function notifyTaskStatusChange(
  taskId: string,
  newStatus: "completed" | "updated" | "overdue",
  actorUserId: string,
  actorName: string,
  taskTitle: string
): Promise<void> {
  try {
    await connectDB();
    const ConversationContext = (await import("@/lib/infra/db/models/conversation-context")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const contexts = await ConversationContext.find({
      linkedTaskIds: new mongoose.Types.ObjectId(taskId),
    }).select("conversationId").lean();

    if (contexts.length === 0) return;

    const statusMessages: Record<string, string> = {
      completed: `Task "${taskTitle}" marked complete by ${actorName}`,
      updated: `Task "${taskTitle}" updated by ${actorName}`,
      overdue: `Task "${taskTitle}" is now overdue`,
    };
    const content = statusMessages[newStatus] || `Task "${taskTitle}" status changed`;

    for (const ctx of contexts) {
      const convId = ctx.conversationId.toString();
      try {
        if (await isAgentMuted(convId, actorUserId)) continue;
        if (!(await canSendProactive(convId, actorUserId, "task_status"))) continue;

        const msg = await DirectMessage.create({
          conversationId: ctx.conversationId,
          senderId: new mongoose.Types.ObjectId(actorUserId),
          senderType: "agent",
          content,
          type: "system",
          agentMeta: { forUserId: new mongoose.Types.ObjectId(actorUserId) },
        });

        await Conversation.updateOne(
          { _id: ctx.conversationId },
          {
            $set: {
              lastMessageAt: msg.createdAt,
              lastMessagePreview: content.slice(0, 100),
              lastMessageSenderId: msg.senderId,
            },
          },
        );

        try {
          const redis = getRedisClient();
          await redis.publish(`chat:${convId}`, JSON.stringify({ type: "message", message: msg }));
        } catch { /* Redis optional */ }
      } catch (err) {
        log.warn({ err, convId, taskId }, "failed to post task status notification");
      }
    }
  } catch (err) {
    log.warn({ err, taskId }, "failed to notify task status change");
  }
}
```

**Step 2: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/chat/task-notifications.ts
git commit -m "feat(chat): add task status notifications to linked conversations"
```

---

## Task 20: Update System Prompts for New Capabilities

Update the agent system prompts to inform the agent about all new tools and behaviors.

**Files:**
- Modify: `src/lib/ai/prompts.ts` (SYSTEM_PROMPTS.ASSISTANT_CHAT and buildRespondPrompt)

**Step 1: Add new tool descriptions to ASSISTANT_CHAT**

Add after the "Cross-Domain Chaining" section (around line 57):

```
Conversation Intelligence Tools:
- summarize_conversation: Summarize chat history (quick or full). Use when asked "catch me up" or "summarize".
- search_messages: Search across conversations by keyword. Use when asked "find where we discussed X".
- generate_standup: Generate daily standup from tasks. Use when asked for "standup" or "daily update".
- conversation_insights: Surface unresolved questions, decisions, open items. Use when asked "what's open?".
- translate_message: Translate messages on demand. Use when asked or when detecting non-English.
- suggest_mentions: Suggest relevant people for a topic. Use when discussion needs input from others.

Proactive Behaviors (automatic, rate-limited):
- Meeting prep: 15 min before meetings, post agenda + linked tasks + relevant notes
- Deadline reminders: 24h before task due date, remind in relevant conversation
- Follow-up nudges: If meeting action item not started after 48h, check in
- Blocked task alerts: If task hasn't been updated in 3+ days, flag it
- All proactive messages are rate-limited: max 3 per conversation per day
- Users can mute proactive messages per conversation
```

**Step 2: Update respond prompt action types**

In `buildRespondPrompt`, update the available actionTypes line to include `create_tasks_from_meeting`.

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ai/prompts.ts
git commit -m "feat(prompts): update system prompts with new conversation intelligence tools and proactive behaviors"
```

---

## Task 21: Final Build Verification and Test Run

Verify the entire implementation builds and all existing tests pass.

**Step 1: Full build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -20`
Expected: Build succeeds with no errors

**Step 2: Run all tests**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx vitest run 2>&1 | tail -20`
Expected: All tests pass

**Step 3: Fix any failures**

If tests or build fail, fix the issues and re-run.

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build and test issues from messages AI integration"
```

---

## Files Summary

| Action | File | Task |
|--------|------|------|
| **Modify** | `src/lib/infra/db/models/conversation.ts` | 1 |
| **Modify** | `src/lib/infra/db/models/direct-message.ts` | 2 |
| **Modify** | `src/lib/infra/db/models/conversation-context.ts` | 3 |
| **Modify** | `src/lib/chat/agent-processor.ts` | 4, 13, 17 |
| **Modify** | `src/lib/ai/prompts.ts` | 4, 17, 20 |
| **Modify** | `src/app/api/conversations/[id]/messages/route.ts` | 4, 18 |
| **Create** | `src/lib/chat/proactive-limiter.ts` | 5 |
| **Modify** | `src/lib/ai/tools.ts` | 6, 7, 8, 9, 10, 11, 14 |
| **Modify** | `src/app/api/ai/action/confirm/route.ts` | 12 |
| **Modify** | `src/lib/chat/agent-tools.ts` | 13 |
| **Modify** | `src/app/api/meetings/[meetingId]/leave/route.ts` | 14 |
| **Create** | `src/lib/chat/proactive-triggers.ts` | 15 |
| **Create** | `src/app/api/cron/proactive/route.ts` | 16 |
| **Create** | `src/lib/chat/task-notifications.ts` | 19 |

## Verification

1. `npx next build` -- zero errors
2. `npx vitest run` -- all existing tests pass
3. Agent responds as "{User}'s Yoodler" in conversations
4. New tools are callable via Gemini function calling
5. Proactive messages respect rate limits (3/day/agent/conversation)
6. Meeting end triggers action item extraction + task proposals
7. In-meeting chat messages are tagged with `meetingContext: true`
8. Urgent messages get `priority: "high"` flag

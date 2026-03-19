# Messages + AI Integration Design

**Goal:** Transform Yoodle's messaging into an AI-powered collaboration hub with personal agents ("Yoodlers") that act as active teammates — connecting messages to meetings, tasks, calendar, and Google Drive.

**Architecture:** Multi-agent model where each user has their own personal agent in every conversation. Extends the existing 5-stage agent pipeline, adds new AI tools, introduces proactive message triggers via task/meeting lifecycle hooks, and adds rate-limited proactive messages.

**Key Principle — Tiered Autonomy:**
- Read-only actions (summaries, search, prep notes, insights) execute automatically
- Write actions (create task, schedule meeting, send reminder) use `propose_action` confirmation

**Key Principle — Personal Agents:**
- Each participant can enable their own agent in any conversation (1:1 or group)
- Agent is named `{displayName}'s Yoodler`
- Each agent authenticates with its owner's OAuth tokens — can only access its owner's calendar, tasks, Google Drive
- No shared agent in group chats — solves the fundamental problem that a shared agent has no authority to access anyone's personal data

---

## Multi-Agent Model

### Why Personal Agents

A single shared agent per group conversation cannot:
- Access any participant's personal Google Calendar (no OAuth tokens)
- Access any participant's personal tasks or Google Drive
- Send proactive reminders scoped to a specific user's deadlines
- Provide personalized context (different users have different meetings, tasks, priorities)

Personal agents solve this because each one uses its owner's existing Google auth. No permission gymnastics, no data leakage.

### Conversation Model Changes

Current model has a single `agentEnabled: boolean` per conversation. New model:

```
participants: [
  {
    userId: ObjectId,
    agentEnabled: boolean,    // whether this user's Yoodler is active
    agentMutedUntil?: Date,   // optional mute for proactive messages
  }
]
```

Each participant independently controls whether their agent is active in the conversation.

### Message Routing

- **Direct address**: "Hey Yoodler, what's on my calendar?" — the speaker's own agent responds
- **Named address**: "Udit's Yoodler, when is Udit free?" — Udit's agent responds (only with data Udit has shared/made visible)
- **No address**: No agent responds (unless it's a proactive trigger for a specific user)
- **1:1 conversations**: Same as today — the user's agent responds when addressed

### Agent Identity in Messages

```
{
  senderType: "agent",
  senderDisplayName: "Udit's Yoodler",
  agentMeta: {
    forUserId: ObjectId,       // the agent's owner
    toolCalls: [...],
    pendingAction: {...}
  }
}
```

### Privacy Boundary

- Udit's Yoodler can ONLY access Udit's calendar, tasks, Google Drive
- Sarah asking "Udit's Yoodler, show me Udit's calendar" — agent refuses (privacy)
- Sarah asking her own Yoodler "when is Udit free?" — Sarah's agent uses `find_mutual_free_slots` which checks shared board membership (existing security check)
- Proactive messages from Udit's Yoodler only contain Udit's data

### Collision Prevention

- Max 1 agent response per user-message (no two agents respond to the same message)
- Proactive messages are rate-limited per agent per conversation
- If multiple agents need to send proactive messages at the same time, they queue with 30-second spacing

---

## Section A: Agent Intelligence Upgrades

### 1. Conversation Summarization

New tool: `summarize_conversation`

- Agent summarizes any conversation on demand ("summarize this chat", "what did we discuss last week")
- Uses `ConversationContext` model (facts, decisions, action items) as base, enriched with recent message history
- Tiered: quick summary (last 20 messages) vs. full summary (entire conversation history)
- Read-only — no confirmation needed

### 2. Smart Reply Suggestions

- After receiving a message, agent analyzes context and suggests 2-3 quick replies
- Delivered as a special message type `suggestion` with clickable options
- Only triggers when agent detects a question or decision point directed at the user
- Read-only analysis — no confirmation needed

### 3. Semantic Search

New tool: `search_messages`

- Agent searches across the user's conversations by meaning, not just keywords
- Backed by MongoDB text index on `DirectMessage.content`
- Agent formats results with conversation context ("In your chat with Sarah on March 10...")
- Scoped to conversations the user is a participant in (privacy)

### 4. Context-Aware Responses

- Enhancement to the existing GATHER stage in the agent pipeline
- When agent responds in a conversation, it automatically fetches:
  - Relevant tasks for the user and conversation participants
  - Upcoming calendar events related to conversation participants
  - Recent meeting notes from meetings with these participants
  - Relevant Google Drive docs (if mentioned or linked)
- Broadens what the agent pulls in before crafting a response

---

## Section B: Messages <-> Meetings Integration

### 5. Post-Meeting Action Extraction

- When a meeting ends, the host's agent analyzes the MoM and:
  - Creates tasks for each action item (assigned to mentioned owner)
  - Posts each created task back into the conversation as confirmation
  - Links tasks to the meeting via `meetingId` field
- Uses `propose_action` pattern — agent proposes batch task creation, host confirms

### 6. Meeting Transcript Posting

- After meeting ends, a condensed transcript (key exchanges, not filler) gets posted to the linked conversation
- Generated from MoM data + meeting notes
- Posted as `agent` type message with collapsible format (preview + full)
- Searchable via `search_messages` tool

### 7. Schedule Meeting from Conversation

- Users say "schedule a meeting with everyone here for next week"
- Agent uses `find_mutual_free_slots` + `propose_meeting_times` across conversation participants
- Proposes times -> user confirms -> creates meeting + calendar event + links to conversation
- Write action — uses `propose_action` confirmation

### 8. Pre-Meeting Prep in Chat

- 15 minutes before a Yoodle meeting, agent posts prep summary into linked conversation:
  - Agenda items (from meeting description or linked tasks)
  - Relevant open tasks for each participant
  - Key decisions from last meeting with these participants
  - Relevant Google Drive docs linked to meeting or tasks
- Each participant's agent posts their personalized prep (their tasks, their docs)
- Read-only — no confirmation needed

### 9. In-Meeting Chat Persistence

- Chat messages sent during an active meeting tagged with `meetingContext: true` + timestamp offset
- After meeting ends, messages remain in conversation as searchable record
- Agent can reference "what was discussed at minute 15" type queries

---

## Section C: Messages <-> Tasks Integration

### 10. Auto-Detect Action Items

- During REFLECT stage, agent scans messages for action-item patterns:
  - "I'll do X by Friday"
  - "Can you handle Y"
  - "Let's make sure Z happens"
- Detected items proposed as tasks via `propose_action`
- Agent infers assignee from conversation context (who said it, who was addressed)
- Sets due date from time references ("by Friday", "next week", "end of month")

### 11. Task Status Notifications

- When a task linked to a conversation changes status (completed, overdue, updated), agent posts notification
- Lightweight system-style message: "Task 'Update proposal' marked complete by Sarah"
- Only fires for tasks created from or discussed in that conversation
- The task owner's agent posts the notification

### 12. Daily Standup Generation

New tool: `generate_standup`

- Agent compiles standup summary for a user or group:
  - Tasks completed yesterday
  - Tasks in progress today
  - Blockers (overdue tasks, tasks with no progress)
- Triggered on demand ("give me a standup") or proactively if enabled
- In group conversations, each user's agent can contribute their section

### 13. Task Discussion Threads

- When a task is mentioned or created in chat, agent links conversation to the task
- Future updates to that task reference the original conversation context
- Agent can answer "what was the context behind this task?" by pulling original messages

---

## Section D: Messages UX with AI

### 14. Priority Detection

- Agent analyzes incoming messages and flags high-priority ones:
  - Urgency language ("ASAP", "urgent", "blocking", "deadline today")
  - Sender relationship (people you share active tasks/meetings with rank higher)
  - Content relevance (mentions tasks you own, meetings you're in)
- Flagged messages get `priority: "high"` field for UI treatment
- Read-only — no confirmation needed

### 15. Smart @Mentions

New tool: `suggest_mentions`

- When composing a message, agent suggests relevant people based on context
- "We need to discuss the API design" -> suggests teammates who own API-related tasks or were in last API meeting
- Cross-references tasks, meetings, and conversation history

### 16. Message Translation

New tool: `translate_message`

- Agent translates messages on demand ("translate this to Spanish")
- Or detects non-primary-language message and offers translation
- Uses existing Gemini integration
- Read-only — no confirmation needed

### 17. Conversation Insights

New tool: `conversation_insights`

- Agent analyzes a conversation and surfaces:
  - Unresolved questions (asked but never answered)
  - Decisions made (from ConversationContext)
  - Open action items not yet converted to tasks
  - Topic distribution (what this conversation is mostly about)
- On-demand only ("what's open in this chat?")

---

## Section E: Proactive Agent Behaviors

All proactive behaviors are rate-limited and scoped per user's agent.

### 18. Deadline Reminders

- Agent monitors tasks assigned to its owner
- Posts reminder in relevant conversation when task due within 24h and not completed
- Format: "Reminder: 'Finalize proposal' is due tomorrow. Need more time?"
- Max 1 reminder per task, only in conversations where task was discussed/created

### 19. Meeting Prep Summaries

- 15 minutes before scheduled meeting, agent posts prep (see Section B, feature 8)
- In 1:1 conversations, if you have a meeting with that person soon, agent mentions it
- "You have a meeting with Sarah in 30 min — you have 2 open tasks with her"

### 20. Follow-Up Nudges

- After meeting ends and action items created, agent tracks progress
- If action item not started 48h after creation, agent nudges assignee in relevant conversation
- "Just checking — 'Send revised timeline' from Tuesday's meeting hasn't been started. Still on track?"
- Uses `propose_action` — nudge is the action, user can dismiss

### 21. Blocked Task Alerts

- When a task is in-progress with no updates for 3+ days, agent alerts in conversation
- "'API integration' has been in progress for 4 days with no updates. Need help?"
- Only fires in conversations with the task assignee

### 22. Weekly Digest

- Once per week (Monday morning), agent posts digest in group/board conversations:
  - Tasks completed last week
  - Tasks due this week
  - Upcoming meetings
  - Unresolved items from conversations
- Opt-in per conversation, not on by default

### Rate Limiting

- Global cap: max 3 proactive messages per agent per conversation per day
- Per-type caps: 1 deadline reminder, 1 follow-up nudge, 1 meeting prep per conversation per day
- User can mute proactive messages per conversation via `agentMutedUntil` field
- If multiple agents need to send proactive messages simultaneously, they queue with 30-second spacing

---

## New Tools Summary

| Tool | Domain | Autonomy |
|------|--------|----------|
| `summarize_conversation` | A - Intelligence | Read (auto) |
| `search_messages` | A - Intelligence | Read (auto) |
| `suggest_mentions` | D - UX | Read (auto) |
| `translate_message` | D - UX | Read (auto) |
| `conversation_insights` | D - UX | Read (auto) |
| `generate_standup` | C - Tasks | Read (auto) |

## Model Changes Summary

| Model | Change |
|-------|--------|
| `Conversation.participants` | Add `agentEnabled`, `agentMutedUntil` per participant |
| `DirectMessage` | Add `priority` field, `meetingContext` boolean, `suggestion` type |
| `ConversationContext` | Add `linkedTaskIds`, `linkedMeetingIds` for cross-reference tracking |

## Files Likely Modified

- `src/lib/infra/db/models/conversation.ts` — participant agent fields
- `src/lib/infra/db/models/direct-message.ts` — new fields
- `src/lib/infra/db/models/conversation-context.ts` — linked IDs
- `src/lib/ai/tools.ts` — new tool declarations + executors
- `src/lib/chat/agent-tools.ts` — enhanced GATHER stage
- `src/lib/chat/agent-processor.ts` — multi-agent routing, collision prevention
- `src/app/api/conversations/[id]/messages/route.ts` — agent routing logic
- `src/app/api/meetings/[meetingId]/leave/route.ts` — post-meeting action extraction hook
- `src/components/chat/` — UI for suggestions, priority badges, agent identity

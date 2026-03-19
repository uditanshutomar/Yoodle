# Meetings AI Integration Design

## Overview

Comprehensive AI integration across the Meetings section with deep bidirectional Google Workspace connectivity. Google serves as the system of record for calendar/docs/drive. AI operates in "act & notify" mode — executes actions automatically and notifies users with undo capability.

Scope covers both internal meeting intelligence AND cross-domain orchestration to boards, chat, dashboard, ghost rooms, and all Google Workspace products (Calendar, Docs, Sheets, Gmail, Drive, Slides).

---

## Section 1: Meeting Intelligence (In-Meeting AI)

### 1.1 Real-Time AI Copilot
- Live sidebar during meetings providing:
  - **Agenda tracker** — AI parses meeting title/description/linked doc to extract agenda items, tracks progress based on transcript
  - **Live suggestions** — Context-aware prompts ("You mentioned Q2 targets — want me to pull the latest numbers from the linked Sheet?")
  - **Fact checker** — Cross-references stated metrics/dates with linked Google Sheets/Docs/board data, flags discrepancies
  - **Smart notes** — Real-time structured note-taking beyond transcript — captures decisions, action items, blockers as they happen

### 1.2 Speaker Analytics
- Per-participant talk time percentage with visual bars
- Interruption detection and count
- Sentiment arc per speaker over meeting duration
- "Quiet participant" nudge — AI notices someone hasn't spoken in 10+ minutes, suggests host invite their input

### 1.3 Post-Meeting Intelligence
- **Auto-highlights** — 3-5 most important moments (decisions, disagreements, commitments) with timestamp links
- **Meeting quality score** — Based on agenda coverage, decision density, action item clarity, participation balance
- **Trend analytics** — Over time: meeting duration trends, productivity trends, recurring meeting engagement patterns

---

## Section 2: Cross-Domain Orchestration (Meeting to Everything)

### 2.1 Pre-Meeting Auto-Preparation
When a scheduled meeting is 30min away, AI automatically:
- Pulls relevant board tasks (linked to participants or mentioned in description) into a **meeting brief** Google Doc
- Checks unread Gmail threads between participants, surfaces key threads in the brief
- Scans Google Drive for recently edited docs shared among participants, links them
- Reviews past meeting MoMs with same participants, extracts unresolved action items
- Posts the brief link in the meeting's auto-created conversation

### 2.2 Post-Meeting Cascade (Act & Notify)
Sequential pipeline when a meeting ends:

| Step | Action | Target |
|------|--------|--------|
| 1 | Push structured MoM to a new Google Doc (titled "MoM — {title} — {date}") | Google Docs |
| 2 | Create board tasks from action items (assignee mapped from participants, due dates from MoM) | Boards |
| 3 | Send follow-up email to all participants with summary + action items + Doc link | Gmail |
| 4 | If recurring metrics discussed, append row to linked Google Sheet | Google Sheets |
| 5 | Update linked board cards with "Discussed in meeting" comment + decisions made | Boards |
| 6 | If next meeting needed, find mutual free slots and create Calendar event | Google Calendar |
| 7 | Notify user of all actions taken via AI chat with undo buttons per action | Yoodle AI Chat |

### 2.3 Meeting to Board Deep Link
- Board tasks created from meetings carry `sourceMetadata: { meetingId, momentTimestamp, transcriptExcerpt }` — click task to jump to exact transcript moment
- Board view gets "Meeting Origins" filter — show only tasks born from meetings

### 2.4 Meeting to Chat Continuity
- Meeting conversation stays active after meeting ends
- AI posts periodic updates: "3 of 5 action items from last Tuesday's meeting are done. 2 overdue."
- Participants can reply in thread, AI routes responses to the right board task comments

---

## Section 3: Meeting and Google Workspace Deep Integration

### 3.1 Google Docs as Living Meeting Notes
- Each meeting auto-creates a Google Doc (or links to existing one from calendar event description)
- During meeting: AI appends real-time structured notes to the Doc
- After meeting: MoM replaces/enriches draft notes with final structured output
- Consistent template: Header, Attendees, Agenda, Notes, Decisions, Action Items, Next Steps
- Shared with all participants automatically via Drive permissions

### 3.2 Google Sheets Analytics Dashboard
- AI maintains per-workspace Google Sheet: "Meeting Analytics — {workspace}"
- Columns: Date, Title, Duration, Participants, Decision Count, Action Items Created, Action Items Completed, Meeting Score
- Row appended after every meeting ends
- AI generates charts/pivot summaries on request
- Linked from Yoodle dashboard as external analytics source

### 3.3 Gmail Integration
- **Pre-meeting**: Scans Gmail for threads between participants, surfaces unresolved email discussions as agenda suggestions
- **Post-meeting**: Auto-send follow-up email with MoM summary, action items, Google Doc link
- **Ongoing**: If action item owner hasn't updated task in 48h, AI sends gentle Gmail nudge on behalf of meeting host

### 3.4 Google Calendar as Source of Truth
- Calendar event always authoritative for time/attendees
- Calendar attendee changes sync to Yoodle meeting participants
- Calendar event description auto-updated with: meeting link, brief doc link, MoM doc link, recording link
- Recurring meetings: AI tracks cross-meeting action item completion, adds "Carryover items" to next occurrence

### 3.5 Google Drive Organization
- Auto-folder structure: `Yoodle Meetings / {YYYY-MM} / {Meeting Title}`
- Each folder contains: Recording, Transcript (.txt), MoM Doc, shared files from meeting chat
- Shared with participants matching meeting permissions
- AI can search across all meeting Drive folders

---

## Section 4: Meetings as Hub to Other Yoodle Sections

### 4.1 Meeting to AI Assistant Integration
- AI chat gets meeting-aware context:
  - "What did we decide about X?" — searches across all MoMs and transcripts
  - "Summarize my meetings this week" — aggregates from MoM docs + calendar
  - "Who keeps missing action items?" — cross-references meeting action items with board task completion
- New AI tools: `search_meeting_history`, `get_meeting_analytics`, `prepare_meeting_brief`, `generate_meeting_slides`

### 4.2 Meeting to Dashboard Widgets
- **Meeting Pulse** — Today's meetings with AI-generated one-line previews
- **Action Item Tracker** — Cross-meeting action item burndown chart
- **Meeting Load** — Weekly meeting hours trend with AI suggestion for optimization
- **Upcoming Brief** — Next meeting's auto-generated brief preview with quick links

### 4.3 Meeting to Ghost Rooms
- Ghost rooms get lighter AI treatment (no Google Doc creation — ephemeral by nature)
- AI still captures key decisions in ghost notes
- If ghost room converted to regular meeting via vote, AI retroactively generates full MoM and triggers post-meeting cascade
- Ghost room insights feed into AI chat but aren't pushed to Sheets

### 4.4 Board to Meeting Reverse Flow
- From any board task: "Schedule a meeting about this task" — AI pre-populates title, description, invites assignee + reporter + commenters
- Board sprint retrospective: AI auto-generates meeting agenda from sprint's completed/incomplete tasks
- Blocked task detection: if task blocked 48h+, AI suggests scheduling 15-min meeting with blocker owner

---

## Section 5: Advanced AI Features

### 5.1 Meeting Pattern Recognition
- AI learns from meeting history and surfaces insights:
  - Duration patterns ("1:1s with Sarah always run 15min over")
  - Productivity patterns ("Monday standups generate 60% more action items")
  - Correlation patterns ("Meetings without agenda docs take 2x longer to reach decisions")

### 5.2 Smart Scheduling
Beyond finding free slots, AI considers:
- Participant energy patterns (avoids decision-heavy meetings at low-engagement times)
- Meeting clustering (groups related meetings to reduce context-switching)
- Buffer time (ensures no back-to-back unless user opts in)
- Time zone awareness with preference for overlap windows

### 5.3 Meeting Templates
- AI creates reusable templates from successful meetings
- Templates include: default duration, agenda skeleton, pre-meeting checklist, post-meeting cascade config
- Linked to Google Doc templates for consistent formatting

### 5.4 Cross-Meeting Knowledge Graph
- Topics: which meetings discussed them, what was decided, how decisions evolved
- People: who's the expert on what topic based on meeting contributions
- Decisions: timeline of how a decision evolved across multiple meetings
- Queryable via AI chat

### 5.5 Meeting Effectiveness Coaching
- Private coaching to meeting hosts (opt-in):
  - Participation balance feedback
  - Scope creep detection
  - Action item quality correlation with completion rates

---

## Architecture

### New Mongoose Models
- `MeetingBrief` — pre-meeting brief with linked sources, generated doc URL
- `MeetingAnalytics` — per-meeting metrics (talk time, sentiment, score, participation)
- `MeetingTemplate` — reusable meeting structures
- `MeetingKnowledge` — knowledge graph entries (topic, decision, person nodes)

### New AI Tools (added to tools.ts)
- `search_meeting_history` — full-text across transcripts/MoMs
- `get_meeting_analytics` — pull stats and trends
- `prepare_meeting_brief` — on-demand brief generation
- `generate_meeting_slides` — Google Slides from MoM
- `suggest_meeting_time` — smart scheduling with pattern awareness
- `create_meeting_template` — save/apply meeting templates
- `query_knowledge_graph` — cross-meeting knowledge search

### New Google Workspace Services
- `google/slides.ts` — create/update presentations from meeting data
- Extend `google/docs.ts` — meeting doc templates, real-time append
- Extend `google/sheets.ts` — analytics dashboard sheet management
- Extend `google/gmail.ts` — follow-up emails, nudge emails
- Extend `google/drive.ts` — auto-folder structure, cross-meeting search

### New API Routes
- `/api/meetings/[meetingId]/brief` — GET/POST meeting brief
- `/api/meetings/[meetingId]/analytics` — GET meeting analytics
- `/api/meetings/[meetingId]/copilot` — SSE stream for real-time AI suggestions
- `/api/meetings/analytics/trends` — GET workspace-wide trends
- `/api/meetings/templates` — CRUD for meeting templates
- `/api/meetings/knowledge` — search knowledge graph

### New Components
- `MeetingCopilotSidebar` — real-time AI sidebar during meetings
- `SpeakerAnalytics` — talk time / sentiment visualization
- `MeetingBriefCard` — pre-meeting brief preview
- `MeetingScoreCard` — post-meeting quality score
- `ActionItemTracker` — cross-meeting burndown widget
- `MeetingPulse` — dashboard widget with AI previews
- `MeetingLoadChart` — weekly meeting hours trend

### Cascade Pipeline
New module: `src/lib/ai/meeting-cascade.ts` — sequential post-meeting pipeline executing the 7-step cascade with per-step undo tokens stored in Redis, notification posted to AI chat.

### Autonomy Model
- All actions execute automatically (act & notify)
- Each action generates an undo token stored in Redis (TTL: 24h)
- User notified via AI chat with per-action undo buttons
- Undo reverses the action (delete created doc, remove task, unsend email draft, etc.)

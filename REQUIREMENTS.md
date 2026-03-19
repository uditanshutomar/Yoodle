# Yoodle — Product Requirements

## Vision
A virtual meeting and collaboration app built for the Gen Z workforce. Fun, AI-native, and deeply integrated with Google Workspace.

## Core Features

### 1. Video & Audio Calling (Rooms)
- HD video calls (1:1 and group) via LiveKit
- Audio-only mode
- Screen sharing
- Real-time reactions & emoji overlays
- **Floating circles** (not boxes) for video tiles — Gen Z scribbled/doodled UI
- **Voice activity detection** — speaker's circle grows when they speak
- **Speaker metadata** — name + timestamp saved per speech segment for transcript attribution
- **Live captions** — real-time speech-to-text via Deepgram during calls
- **Meeting Blueprints** — pre-configured room templates (standup, brainstorm, retro, etc.)

### 2. Meeting Intelligence
- Meeting recording (video + audio)
- Auto-generated transcripts (Deepgram speech-to-text)
- AI-generated minutes of meeting (Gemini)
- Action item extraction
- Post-meeting cascade pipeline (BullMQ durable jobs: transcript, summary, action items)

### 3. Task Board (The Board)
- Kanban board with drag-and-drop columns (To Do, In Progress, Done, etc.)
- **AI-powered subtask generation** — Gemini breaks tasks into actionable subtasks
- List and board view toggle
- Task assignment and due dates
- Integration with meeting action items (auto-created tasks)

### 4. Calendar Integration
- **Google Calendar two-way sync** — create, update, and delete events
- **Conflict detection** — warns when scheduling over existing events
- **Smart scheduling** — AI analyzes availability across participants' calendars
- Calendar sync runs as a durable BullMQ job (`calendar-sync` queue)

### 5. Pulse Analytics
- **Meeting pattern analysis** — frequency, duration, attendance trends
- **Team health metrics** — collaboration scores, engagement indicators
- **Pattern alerts** — AI-detected anomalies (e.g., meeting overload, declining participation)
- Stats grid with visual indicators

### 6. AI Assistant Mascot (Yoodler)
Powered by Gemini API. Has access to files, mails, tasks, messages, and calendar.
- **Personalized per user** — each person's agent is different (trained on their data)
- **Private during calls** — each person only sees their OWN agent on screen (not others' agents)
- **AI Memory** — per-user memory (capped at 200 entries with LRU eviction), remembers context across sessions
- **Proactive insights** — surfaces relevant information before you ask
- **Cross-domain tools** — can read/write Gmail, Drive, Sheets, Slides, Docs, Calendar

#### Capabilities:
1. **Meeting Prep** — Gives you a zest of what you're supposed to do, reminds you what to say in meetings
2. **Smart Scheduling** — Analyzes estimated task time, finds suitable slots from concerned people's calendars
3. **Location Sharing** — For remote workers. Know if a colleague or community member is nearby (coworking spaces, cafes)
4. **Mundane Task Automation** — Saves files in correct places, follows naming norms, handles the boring stuff
5. **Memory** — Remembers non-trivial nice-to-have things you'd otherwise forget
6. **Plan Summarizer** — Summarizes plans and sends to AI to proofread
7. **Google Workspace Integration** — Read and compose emails, create docs/sheets/slides, search Drive

### 7. Ghost Rooms
- Everything vanishes after the session (for brainstorming & first-time meetings)
- No data persisted by default
- Data downloadable only when ALL participants agree
- Perfect for sensitive discussions and creative brainstorming

### 8. Messaging & Conversations
- Persistent chat threads between users
- Real-time message delivery via LiveKit data channels
- Cross-tab coordination with broadcast polling (only visible tab polls)
- Unread message counts

## Sponsor Tech Stack

| Sponsor            | Usage                                                                 |
|--------------------|-----------------------------------------------------------------------|
| **Gemini API**     | AI assistant, summarization, proofreading, task analysis, subtask generation, proactive insights |
| **Deepgram**       | Speech-to-text, meeting transcription, live captions                  |
| **MongoDB Atlas**  | Database — users, meetings, messages, tasks, AI memory, audit logs    |
| **LiveKit**        | Real-time media — video/audio transport, data channels, recording     |

## Architecture Overview

### Frontend
- Next.js 16 (App Router)
- TypeScript + Tailwind CSS 4
- Framer Motion (animations)
- LiveKit client SDK (video/audio/data)

### Backend
- Next.js API routes (all server logic runs within Next.js)
- MongoDB Atlas (via Mongoose)
- Redis (caching, pub-sub, rate limiting via sliding window)
- BullMQ (durable job queues: recording processing, post-meeting cascade, calendar sync)
- Gemini API integration
- Deepgram API integration
- Google Workspace APIs (Gmail, Calendar, Drive, Sheets, Slides, Docs)

### Real-time
- LiveKit for all media transport (video, audio, screen share)
- LiveKit data channels for real-time signaling and presence
- LiveKit SDK-native reconnect policy with exponential backoff

### Infrastructure Patterns
- Circuit breakers for external services (Google, Deepgram, LiveKit)
- Retry with exponential backoff and jitter for transient errors
- Rate limiting per route group (auth, ai, voice, meetings, calendar, general)
- Feature flags by edition (community vs cloud)
- Structured logging with namespace prefixes

## User Personas
- Gen Z remote workers
- Small startup teams
- Freelancers in coworking spaces
- Student project groups

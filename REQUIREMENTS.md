# Yoodle — Product Requirements

## Vision
A virtual meeting app (like Google Meet) built for the Gen Z workforce. Fun, AI-native, and collaborative.

## Core Features

### 1. Video & Audio Calling
- HD video calls (1:1 and group)
- Audio-only mode
- Screen sharing
- Real-time reactions & emoji overlays
- **Floating circles** (not boxes) for video tiles — Gen Z scribbled/doodled UI
- **Voice activity detection** — speaker's circle grows when they speak
- **Speaker metadata** — name + timestamp saved per speech segment for transcript attribution
- **Google Integration API** — calendar, Gmail, Drive access for personal agent

### 2. Meeting Intelligence
- Meeting recording (video + audio)
- Auto-generated transcripts (11 Labs)
- AI-generated minutes of meeting
- Action item extraction

### 3. Shared Virtual Work Environments
- Shared cloud workspaces powered by Vultr VMs
- Login-based audit trail (who did what)
- Shared AI codespace (GitHub integration)
- Anyone can prompt or change code — "Group Videcode"
- One VM per team, shared subscriptions & tools
- Better LLM context (everyone on same machine)

### 4. AI Assistant Mascot (Doodle Poodle)
Powered by Gemini API. Has access to files, mails, tasks, messages.
- **Personalized per user** — each person's agent is different (trained on their data)
- **Private during calls** — each person only sees their OWN agent on screen (not others' agents)
- **MCP integration** — Model Context Protocol for personal agent tool access

#### Capabilities:
1. **Meeting Prep** — Gives you a zest of what you're supposed to do, reminds you what to say in meetings
2. **Smart Scheduling** — Analyzes estimated task time, finds suitable slots from concerned people's calendars
3. **Location Sharing** — For remote workers. Know if a colleague or community member is nearby (coworking spaces, cafes). Work together, make new friends
4. **Mundane Task Automation** — Saves files in correct places, follows naming norms, handles the boring stuff
5. **Memory** — Remembers non-trivial nice-to-have things you'd otherwise forget
6. **Plan Summarizer** — Summarizes plans and sends to AI to proofread

### 5. Ghost Rooms
- Everything vanishes after the session (for brainstorming & first-time meetings)
- No data persisted by default
- Data downloadable only when ALL participants agree
- Perfect for sensitive discussions and creative brainstorming

## Sponsor Tech Stack

| Sponsor        | Usage                                         |
|----------------|-----------------------------------------------|
| **Gemini API** | AI assistant, transcription, summarization, proofreading, task analysis |
| **11 Labs**    | Voice synthesis, meeting transcription, audio processing |
| **MongoDB Atlas** | Database — users, meetings, messages, files, audit logs |
| **Vultr**      | Cloud infrastructure — VMs for shared workspaces, app hosting |

## Architecture Overview

### Frontend
- Next.js 15 (App Router)
- TypeScript + Tailwind CSS
- Framer Motion (animations)
- WebRTC (video/audio)
- Socket.io client (real-time)

### Backend
- Next.js API routes + separate WebSocket server
- MongoDB Atlas (via Mongoose)
- WebRTC signaling server
- Gemini API integration
- 11 Labs API integration

### Infrastructure (Vultr)
- App server VM
- Shared workspace VMs (per-team)
- TURN/STUN servers for WebRTC

### Real-time
- Socket.io for signaling, chat, presence
- WebRTC for peer-to-peer video/audio
- MediaRecorder API for recording

## User Personas
- Gen Z remote workers
- Small startup teams
- Freelancers in coworking spaces
- Student project groups

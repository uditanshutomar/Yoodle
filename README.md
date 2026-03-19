# Yoodle

A modern video conferencing and collaboration platform built for Gen Z, featuring an AI-powered assistant (Yoodler), ephemeral brainstorming rooms, Kanban task boards, analytics, and deep Google Workspace integration.

https://yoodle.vercel.app/

## Features

### Crystal Calls
Real-time video and audio conferencing powered by LiveKit. Supports screen sharing, in-meeting chat, emoji reactions, hand raise, voice activity detection, recording with tab audio capture, and configurable room settings (waiting room, mute on join, max participants). All real-time signaling runs over LiveKit data channels.

### Yoodler (AI Assistant)
An integrated AI assistant powered by Google Gemini that generates meeting prep briefings, auto-summarizes meetings into structured minutes (key points, decisions, action items), assists with writing and proofreading, and manages tasks across the platform. Yoodler maintains per-user memory with LRU eviction (capped at 200 per user) and delivers proactive insights based on your calendar, meetings, and activity patterns.

### Ghost Rooms
Ephemeral brainstorming spaces that auto-delete after a configurable TTL. Participants can capture notes and messages during the session and vote to save the room before it expires.

### Ship Together (Workspaces)
Team collaboration spaces for organizing projects, sharing resources, and coordinating work. Includes member role management (owner, admin, member) and integrated communication channels.

### The Board
Kanban task board with drag-and-drop columns, AI-powered subtask generation, and cross-domain integration. Tasks can be linked to meetings, conversations, and calendar events.

### Pulse Analytics
Meeting pattern analysis and team health metrics. Includes stats grids, pattern alerts, and insights into collaboration trends across your organization.

### Calendar Integration
Full Google Calendar sync with conflict detection, meeting prep briefings, and proactive scheduling suggestions powered by Yoodler.

### Recordings & Transcription
Record meetings with automatic AI transcription via Deepgram featuring speaker identification. Tab audio capture ensures system audio is recorded alongside microphone input. Generates structured meeting minutes with summaries, decisions, and action items. Recordings are stored directly in each user's Google Drive.

### AI Memory
Per-user memory system with LRU eviction that allows Yoodler to remember context across conversations, provide personalized suggestions, and deliver proactive insights based on accumulated knowledge.

### Google Workspace Integration
Full read/write access to Gmail, Google Calendar, Drive, Docs, Sheets, Slides, Tasks, and Contacts through the Yoodler AI assistant.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack, React 19.2) |
| Language | TypeScript 5 |
| Database | MongoDB (Mongoose) |
| Cache/Pub-Sub | Redis (ioredis) |
| Real-time | LiveKit (media + data channels) |
| Auth | JWT + Google OAuth 2.0 |
| AI | Google Gemini (`@google/genai` SDK) |
| Speech-to-text | Deepgram |
| Job Queues | BullMQ (durable, Redis-backed) |
| Styling | Tailwind CSS 4 |
| UI | Radix UI, Framer Motion, Lucide Icons |
| Email | Resend |
| Storage | Google Drive (per-user recordings) |
| Monitoring | Sentry |
| Validation | Zod |
| Testing | Vitest, Playwright |

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB instance
- Redis instance
- LiveKit server (cloud or self-hosted)
- Google Gemini API key

### Installation

```bash
git clone https://github.com/uditanshutomar/Yoodle.git
cd Yoodle
npm install
```

### Environment Variables

Create a `.env.local` file in the project root. See `.env.example` for the full list. Key variables:

```env
# Database (required)
MONGODB_URI=mongodb://localhost:27017/yoodle
REDIS_URL=redis://localhost:6379

# Authentication (required)
JWT_SECRET=your-jwt-secret-minimum-64-characters-long

# Application (required)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google OAuth (required)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# LiveKit (required for video calls)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880

# AI (required)
GEMINI_API_KEY=your-gemini-api-key

# Speech-to-text (optional)
DEEPGRAM_API_KEY=your-deepgram-api-key

# Monitoring (optional)
SENTRY_DSN=your-sentry-dsn

# Email (optional - falls back to console logging)
RESEND_API_KEY=your-resend-api-key

# Edition (optional - community or cloud)
YOODLE_EDITION=community
```

### Running the App

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Lint
npm run lint

# Tests
npm test
```

The web app starts at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── (auth)/                 # Login, signup, verify
│   ├── (app)/                  # Protected app routes
│   │   ├── dashboard/          # Main dashboard (The Desk)
│   │   ├── meetings/           # Rooms hub + meeting room
│   │   ├── messages/           # Direct messages + AI agent chat
│   │   ├── board/              # Kanban task board
│   │   ├── analytics/          # Pulse analytics
│   │   ├── ghost-rooms/        # Ephemeral brainstorm rooms
│   │   ├── admin/              # Admin panel
│   │   └── settings/           # User settings
│   └── api/                    # API routes
├── components/
│   ├── meeting/                # Video call UI
│   ├── dashboard/              # Dashboard widgets
│   ├── board/                  # Kanban board components
│   ├── chat/                   # Chat/messaging components
│   ├── ghost/                  # Ghost room components
│   ├── ai/                     # AI assistant components
│   ├── pulse/                  # Analytics components
│   ├── layout/                 # Sidebar, topbar
│   └── ui/                     # Reusable UI primitives
├── hooks/                      # Custom React hooks
├── lib/
│   ├── ai/                     # Gemini integration, tools, prompts
│   ├── board/                  # Cross-domain AI board tools
│   ├── chat/                   # Agent processor, message transform
│   ├── google/                 # Google Workspace API clients
│   ├── infra/                  # DB, Redis, auth, logging, jobs, circuit breaker
│   ├── transport/              # LiveKit transport
│   └── features/               # Feature flags
└── proxy.ts                    # Next.js 16 proxy (auth middleware)
```

## API Overview

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth flow
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/refresh` - Refresh JWT token

### Meetings
- `GET /api/meetings` - List meetings
- `POST /api/meetings` - Create a meeting
- `GET /api/meetings/[id]` - Get meeting details
- `POST /api/meetings/[id]/start` - Start recording

### Waiting Room
- `GET /api/meetings/[id]/waiting-status` - Check waiting room status
- `POST /api/meetings/[id]/admit` - Host admits a user
- `POST /api/meetings/[id]/deny` - Host denies a user

### Recordings & Transcription
- `GET /api/recordings/[meetingId]` - Get recordings for a meeting
- `POST /api/recordings/upload` - Upload recording to Google Drive
- `POST /api/transcription` - Process transcription with AI

### Board (Tasks)
- `GET /api/boards` - List boards
- `POST /api/boards` - Create a board
- `GET /api/boards/[id]` - Get board details
- `GET /api/tasks/my` - Get current user's tasks

### Conversations
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create a conversation
- `GET /api/conversations/[id]` - Get conversation details

### Calendar
- `GET /api/calendar` - Get calendar events
- `POST /api/calendar/sync` - Sync with Google Calendar

### AI
- `POST /api/ai/chat` - Chat with Yoodler assistant
- `POST /api/ai/briefing` - Generate meeting briefing
- `POST /api/ai/action/[type]` - Execute AI actions (summarize, extract tasks, etc.)
- `GET /api/cron/proactive` - Proactive insights cron job

### Other
- `GET /api/users/me` - Current user profile
- `GET /api/livekit/token` - Generate LiveKit room token
- `GET /api/health` - Health check

## Real-time Communication

All real-time features run over **LiveKit data channels** — no separate signaling server required.

| Feature | Transport | Reliability |
|---------|-----------|-------------|
| Chat messages | Data channel | Reliable |
| Emoji reactions | Data channel | Lossy |
| Hand raise/lower | Data channel + metadata | Reliable |
| Host mute/kick | Data channel (targeted) | Reliable |
| Recording status | Data channel | Reliable |
| Voice activity | LiveKit native (`ActiveSpeakersChanged`) | — |
| Media state (mic/cam) | LiveKit native (track events) | — |
| Screen sharing | LiveKit native (track publish) | — |

## Deployment

Yoodle is configured for deployment on Vercel. The `vercel.json` specifies the `iad1` (Northern Virginia) region.

```bash
vercel deploy
```

## License

MIT License

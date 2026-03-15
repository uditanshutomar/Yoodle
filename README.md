# Yoodle

A modern video conferencing and collaboration platform built for Gen Z, featuring AI-powered meeting assistance, ephemeral brainstorming rooms, shared cloud workspaces, and deep Google Workspace integration.

https://yoodle.vercel.app/

## Features

### Crystal Calls
Real-time video and audio conferencing powered by LiveKit. Supports screen sharing, in-meeting chat, emoji reactions, hand raise, voice activity detection, recording with tab audio capture, and configurable room settings (waiting room, mute on join, max participants). All real-time signaling runs over LiveKit data channels — no separate server needed.

### Doodle AI Assistant
An integrated AI assistant powered by Google Gemini that generates meeting prep notes, auto-summarizes meetings into structured minutes (key points, decisions, action items), assists with writing and proofreading, and manages tasks. Doodle maintains per-user memory and supports agent-to-agent collaboration.

### Ghost Rooms
Ephemeral brainstorming spaces that auto-delete after a configurable TTL. Participants can capture notes and messages during the session and vote to save the room before it expires.

### Ship Together (Workspaces)
Team collaboration spaces with provisioned cloud VMs via Vultr. Includes a browser-based SSH terminal (xterm + SSH2), member role management (owner, admin, member), and auto-shutdown settings to control costs.

### Recordings & Transcription
Record meetings with automatic AI transcription featuring speaker identification. Tab audio capture ensures system audio is recorded alongside microphone input. Generates structured meeting minutes with summaries, decisions, and action items. Recordings are stored directly in each user's Google Drive.

### Google Workspace Integration
Full read/write access to Gmail, Google Calendar, Drive, Docs, Sheets, Tasks, and Contacts through the Doodle AI assistant.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | MongoDB (Mongoose) |
| Real-time | LiveKit (media + data channels) |
| Auth | JWT + Google OAuth 2.0 |
| AI | Google Gemini 2.0 Flash |
| Styling | Tailwind CSS 4 |
| UI | Radix UI, Framer Motion, Lucide Icons |
| Email | Resend |
| Cloud/VMs | Vultr Cloud Computing |
| Storage | Google Drive (per-user recordings) |
| Terminal | SSH2 + xterm |
| Validation | Zod |
| Testing | Vitest, Playwright |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance
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

# Authentication (required)
JWT_SECRET=your-jwt-secret-minimum-64-characters-long
JWT_REFRESH_SECRET=your-jwt-refresh-secret-here

# Application (required)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# LiveKit (required for video calls)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880

# AI (required)
GEMINI_API_KEY=your-gemini-api-key

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email (optional - falls back to console logging)
RESEND_API_KEY=your-resend-api-key
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
│   ├── (auth)/                 # Login, signup, verify routes
│   ├── (app)/                  # Protected app routes
│   │   ├── dashboard/          # Main dashboard
│   │   ├── meetings/           # Meeting list, creation, and room
│   │   ├── workspaces/         # Workspace management
│   │   ├── ghost-rooms/        # Ephemeral brainstorm rooms
│   │   ├── ai/                 # AI chat interface
│   │   └── settings/           # User settings
│   └── api/                    # API routes
│       ├── auth/               # Auth endpoints
│       ├── meetings/           # Meeting CRUD + waiting room
│       ├── recordings/         # Recording management
│       ├── transcription/      # AI transcription
│       ├── workspaces/         # Workspace + VM management
│       ├── ghost-rooms/        # Ghost room endpoints
│       ├── ai/                 # AI chat, summarize, meeting-prep
│       └── health/             # Health check
├── components/
│   ├── meeting/                # Video call UI (bubbles, grid, chat, controls)
│   ├── dashboard/              # Dashboard panels and meeting history
│   ├── workspace/              # Workspace and VM components
│   ├── ghost/                  # Ghost room components
│   ├── ai/                     # AI assistant components
│   ├── layout/                 # Sidebar, topbar
│   └── ui/                     # Reusable UI primitives
├── hooks/                      # Custom React hooks
├── lib/
│   ├── auth/                   # JWT, Google OAuth
│   ├── db/                     # MongoDB connection and Mongoose models
│   ├── ai/                     # Gemini integration and prompts
│   ├── livekit/                # LiveKit data channel messages
│   ├── transport/              # Room transport abstraction (LiveKit)
│   ├── google/                 # Google Workspace API clients
│   ├── vultr/                  # Vultr VM provisioning
│   └── utils/                  # ID generation, validation, API helpers
├── providers/                  # React context providers
├── types/                      # TypeScript type definitions
└── middleware.ts               # Edge middleware for auth protection
```

## API Overview

### Authentication
- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/verify` - Verify email or magic link
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/google/callback` - Google OAuth callback

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

### Workspaces
- `GET /api/workspaces` - List workspaces
- `POST /api/workspaces` - Create workspace with VM
- `GET /api/workspaces/[id]` - Get workspace details
- `POST /api/workspaces/[id]/vm` - Manage workspace VM

### AI
- `POST /api/ai/chat` - Chat with Doodle assistant
- `POST /api/ai/summarize` - Generate meeting minutes
- `POST /api/ai/meeting-prep` - Generate meeting prep notes

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

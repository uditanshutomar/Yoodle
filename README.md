# Yoodle

A modern video conferencing and collaboration platform built for Gen Z, featuring AI-powered meeting assistance, ephemeral brainstorming rooms, shared cloud workspaces, and deep Google Workspace integration.

https://yoodle.vercel.app/

## Features

### Crystal Calls
Real-time video and audio conferencing powered by WebRTC with Socket.io signaling. Supports screen sharing, in-meeting chat, emoji reactions, voice activity detection, and configurable room settings (waiting room, mute on join, max participants).

### Doodle AI Assistant
An integrated AI assistant powered by Google Gemini that generates meeting prep notes, auto-summarizes meetings into structured minutes (key points, decisions, action items), assists with writing and proofreading, and manages tasks. Doodle maintains per-user memory and supports agent-to-agent collaboration.

### Ghost Rooms
Ephemeral brainstorming spaces that auto-delete after a configurable TTL. Participants can capture notes and messages during the session and vote to save the room before it expires.

### Ship Together (Workspaces)
Team collaboration spaces with provisioned cloud VMs via Vultr. Includes a browser-based SSH terminal (xterm + SSH2), member role management (owner, admin, member), and auto-shutdown settings to control costs.

### Recordings & Transcription
Record meetings with automatic AI transcription featuring speaker identification. Generates structured meeting minutes with summaries, decisions, and action items. Files stored in Vultr Object Storage (S3-compatible).

### Google Workspace Integration
Full read/write access to Gmail, Google Calendar, Drive, Docs, Sheets, Tasks, and Contacts through the Doodle AI assistant.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | MongoDB (Mongoose) |
| Real-time | Socket.io (WebRTC signaling) |
| Auth | JWT + Magic Links + Google OAuth 2.0 |
| AI | Google Gemini 2.0 Flash |
| Voice | ElevenLabs |
| Styling | Tailwind CSS 4 |
| UI | Radix UI, Framer Motion, Lucide Icons |
| Email | Resend |
| Cloud/VMs | Vultr Cloud Computing |
| Storage | Vultr Object Storage (S3-compatible, AWS SDK) |
| Terminal | SSH2 + xterm |
| Validation | Zod |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance
- Google Gemini API key

### Installation

```bash
git clone https://github.com/uditanshutomar/Yoodle.git
cd Yoodle
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Database (required)
MONGODB_URI=mongodb://localhost:27017/yoodle

# Authentication (required)
JWT_SECRET=your-jwt-secret-minimum-64-characters-long
# Application (required)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AI (required)
GEMINI_API_KEY=your-gemini-api-key

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Voice / TTS (optional)
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Cloud infrastructure (optional - needed for workspaces)
VULTR_API_KEY=your-vultr-api-key
VULTR_SSH_KEY_ID=your-vultr-ssh-key-id

# Object storage (optional - needed for recordings)
VULTR_OBJECT_STORAGE_HOSTNAME=your-hostname
VULTR_OBJECT_STORAGE_ACCESS_KEY=your-access-key
VULTR_OBJECT_STORAGE_SECRET_KEY=your-secret-key
VULTR_OBJECT_STORAGE_BUCKET=your-bucket-name

# Email (optional - falls back to console logging)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=noreply@yourdomain.com

# WebRTC TURN server (optional)
TURN_SERVER_URL=your-turn-server-url
TURN_USERNAME=your-turn-username
TURN_CREDENTIAL=your-turn-credential
```

### Running the App

```bash
# Development (Next.js + Socket.io server)
npm run dev

# Production build
npm run build
npm start

# Lint
npm run lint
```

The app starts at [http://localhost:3000](http://localhost:3000) with the Socket.io server integrated on the same port.

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
│       ├── meetings/           # Meeting CRUD
│       ├── recordings/         # Recording management
│       ├── transcription/      # AI transcription
│       ├── workspaces/         # Workspace + VM management
│       ├── ghost-rooms/        # Ghost room endpoints
│       ├── ai/                 # AI chat, summarize, meeting-prep
│       ├── agents/             # AI agent collaboration
│       └── health/             # Health check
├── components/
│   ├── meeting/                # Video call UI (bubbles, chat, screen share)
│   ├── dashboard/              # Dashboard panels and meeting history
│   ├── workspace/              # Workspace and VM components
│   ├── ghost/                  # Ghost room components
│   ├── ai/                     # AI assistant components
│   ├── layout/                 # Sidebar, topbar
│   └── ui/                     # Reusable UI primitives
├── hooks/                      # Custom React hooks
├── lib/
│   ├── auth/                   # JWT, Google OAuth, magic links
│   ├── db/                     # MongoDB connection and Mongoose models
│   ├── ai/                     # Gemini integration and prompts
│   ├── realtime/               # Socket.io server and event types
│   ├── google/                 # Google Workspace API clients
│   ├── voice/                  # ElevenLabs integration
│   ├── vultr/                  # Vultr VM provisioning
│   └── utils/                  # ID generation, validation, API helpers
├── providers/                  # React context providers
├── types/                      # TypeScript type definitions
└── middleware.ts               # Edge middleware for auth protection
server.ts                       # Main server entry (Next.js + Socket.io)
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

### Recordings & Transcription
- `GET /api/recordings` - List recordings
- `GET /api/recordings/[meetingId]` - Get recording for a meeting
- `POST /api/recordings/upload-url` - Get a presigned upload URL
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
- `GET /api/turn-credentials` - WebRTC TURN server config
- `GET /api/health` - Health check

## Real-time Events (Socket.io)

| Category | Event | Description |
|----------|-------|-------------|
| Room | `room:join` | Join a meeting room |
| Room | `room:leave` | Leave a meeting room |
| Room | `room:user-joined` | Broadcast: user joined |
| Room | `room:user-left` | Broadcast: user left |
| Signaling | `signal:offer` | WebRTC SDP offer |
| Signaling | `signal:answer` | WebRTC SDP answer |
| Signaling | `signal:ice-candidate` | WebRTC ICE candidate |
| Media | `media:state-changed` | Video/audio toggle |
| Chat | `chat:message` | Send chat message |
| Reaction | `reaction:send` | Send emoji reaction |
| Terminal | `terminal:connect` | Open SSH terminal |
| Terminal | `terminal:data` | Terminal I/O |
| Terminal | `terminal:resize` | Resize terminal |

## Deployment

Yoodle is configured for deployment on Vercel. The `vercel.json` specifies the `iad1` (Northern Virginia) region.

```bash
vercel deploy
```

## License

This project is proprietary. All rights reserved.

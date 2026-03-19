# Make Everything Real — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all fake/mock data with real API calls, connect all disconnected backends to frontends, fix all identified security bugs, and implement missing features across the Yoodle platform.

**Architecture:** 6 independent chunks targeting: (1) Dashboard real data, (2) Auth security hardening, (3) Ghost room bug fixes, (4) Calendar/Tasks API routes, (5) Dark mode + theme system, (6) Settings page completion. Each chunk is independently deployable.

**Tech Stack:** Next.js 14, React 18, MongoDB/Mongoose, Redis, Google APIs (Calendar/Tasks/Drive), Gemini AI, Tailwind CSS, Framer Motion.

---

## Chunk 1: Dashboard — Replace All Fake Data with Real API Calls

### Task 1.1: Replace Fake Meeting History with Real API

**Files:**
- Modify: `src/components/dashboard/MeetingHistory.tsx`
- Modify: `src/components/dashboard/meetingsData.ts` (keep type only, remove fake data)
- Modify: `src/components/dashboard/Dashboard.tsx` (pass user context)

- [ ] **Step 1: Update `meetingsData.ts` — keep the `MeetingRecord` type, remove `MEETINGS_DATA` array**

In `src/components/dashboard/meetingsData.ts`, delete lines 32-191 (the `MEETINGS_DATA` array). Keep lines 1-30 (the `MeetingRecord` type definition). Add an adapter function that maps API meeting data to `MeetingRecord`:

```typescript
// After the MeetingRecord type definition, add:

export interface APIMeeting {
  _id: string;
  code: string;
  title: string;
  description?: string;
  hostId: { _id: string; name: string; email: string; displayName: string; avatarUrl?: string };
  participants: Array<{
    userId: { _id: string; name: string; displayName: string; avatarUrl?: string };
    role: string;
    joinedAt?: string;
    status: string;
  }>;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  status: string;
  type: string;
  recordingId?: string;
  createdAt: string;
}

export function apiMeetingToRecord(m: APIMeeting): MeetingRecord {
  const start = m.startedAt || m.scheduledAt || m.createdAt;
  const end = m.endedAt;
  let duration = "";
  if (start && end) {
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
    duration = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const dateStr = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return {
    id: m._id,
    title: m.title,
    date: dateStr,
    duration,
    project: m.type === "ghost" ? "Ghost" : undefined,
    projectColor: m.type === "ghost" ? "#7C3AED" : undefined,
    avatars: m.participants.slice(0, 4).map((p) => ({
      src: p.userId?.avatarUrl || `/api/avatar/${p.userId?._id || "unknown"}`,
      name: p.userId?.displayName || p.userId?.name || "User",
    })),
    hasSummary: !!m.description,
    hasTranscript: false,
    hasRecording: !!m.recordingId,
  };
}
```

- [ ] **Step 2: Rewrite `MeetingHistory.tsx` to fetch from `/api/meetings`**

Replace the entire `MeetingHistory.tsx` component to fetch real data:

```typescript
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { MeetingRecord, APIMeeting, apiMeetingToRecord } from "./meetingsData";

export default function MeetingHistory({ onSelectMeeting }: { onSelectMeeting: (m: MeetingRecord) => void }) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const res = await fetch("/api/meetings?status=ended&limit=20", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const records = (data.data as APIMeeting[]).map(apiMeetingToRecord);
          setMeetings(records);
        }
      } catch (err) {
        console.error("Failed to fetch meetings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMeetings();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[4px_4px_0_#0A0A0A] p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#0A0A0A]/10 rounded w-1/3" />
          <div className="h-16 bg-[#0A0A0A]/5 rounded-xl" />
          <div className="h-16 bg-[#0A0A0A]/5 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 25 }}
      className="rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[4px_4px_0_#0A0A0A] overflow-hidden p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Past meetings
        </h2>
        <span className="text-[10px] font-bold text-[#0A0A0A]/30 uppercase tracking-wider" style={{ fontFamily: "var(--font-heading)" }}>
          {meetings.length} total
        </span>
      </div>

      {meetings.length === 0 ? (
        <p className="text-xs text-[#0A0A0A]/40 text-center py-6">No past meetings yet. Create your first room!</p>
      ) : (
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
          {meetings.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ x: 2 }}
              onClick={() => onSelectMeeting(m)}
              className="rounded-xl border-[1.5px] border-[#0A0A0A]/15 p-2.5 cursor-pointer hover:border-[#0A0A0A]/40 hover:shadow-[2px_2px_0_rgba(10,10,10,0.08)] transition-all bg-white"
            >
              <div className="flex items-center justify-between mb-1">
                {m.project ? (
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${m.projectColor}15`, color: m.projectColor, fontFamily: "var(--font-heading)" }}>
                    {m.project}
                  </span>
                ) : <span />}
                <span className="text-[10px] text-[#0A0A0A]/25">{m.duration}</span>
              </div>
              <p className="text-[13px] font-semibold text-[#0A0A0A] leading-snug mb-1.5">{m.title}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {m.avatars.slice(0, 3).map((a, idx) => (
                      <div key={idx} className="relative h-[18px] w-[18px] rounded-full overflow-hidden border-2 border-white" title={a.name}>
                        <Image src={a.src} alt={a.name} fill className="object-cover" sizes="18px" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {m.hasSummary && <span className="text-[8px] font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-full px-1.5 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>MoM</span>}
                    {m.hasTranscript && <span className="text-[8px] font-bold text-[#3B82F6] bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-full px-1.5 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>TXT</span>}
                    {m.hasRecording && <span className="text-[8px] font-bold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-full px-1.5 py-0.5" style={{ fontFamily: "var(--font-heading)" }}>REC</span>}
                  </div>
                </div>
                <span className="text-[10px] text-[#0A0A0A]/30">{m.date}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | head -40`

---

### Task 1.2: Replace Fake Calendar with Real Google Calendar API

**Files:**
- Create: `src/app/api/calendar/events/route.ts`
- Modify: `src/components/dashboard/CalendarPanel.tsx`

- [ ] **Step 1: Create API route `src/app/api/calendar/events/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { listEvents } from "@/lib/google/calendar";

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();
  const user = await User.findById(userId);

  if (!user?.googleTokens?.accessToken) {
    // No Google account linked — return empty
    return successResponse([]);
  }

  const searchParams = req.nextUrl.searchParams;
  const timeMin = searchParams.get("timeMin") || new Date().toISOString();
  const timeMax = searchParams.get("timeMax") || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const events = await listEvents(user.googleTokens, {
      timeMin,
      timeMax,
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    });
    return successResponse(events);
  } catch (error) {
    console.error("Calendar API error:", error);
    // Token may be expired — return empty gracefully
    return successResponse([]);
  }
});
```

- [ ] **Step 2: Rewrite `CalendarPanel.tsx` to fetch real events from `/api/calendar/events`**

Replace the hardcoded `EVENTS` array (lines 55-66) with a `useEffect` fetch. Keep the `CalEvent` type. Add state:

```typescript
// Replace lines 55-66 with:
const [events, setEvents] = useState<CalEvent[]>([]);
const [eventsLoaded, setEventsLoaded] = useState(false);

useEffect(() => {
  async function fetchCalendarEvents() {
    try {
      const now = new Date();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - now.getDay());
      sunday.setHours(0, 0, 0, 0);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 7);

      const res = await fetch(
        `/api/calendar/events?timeMin=${sunday.toISOString()}&timeMax=${saturday.toISOString()}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const mapped: CalEvent[] = (data.data || []).map((e: any, i: number) => {
          const start = new Date(e.start?.dateTime || e.start?.date);
          const end = new Date(e.end?.dateTime || e.end?.date);
          const dayIndex = start.getDay();
          const startHour = start.getHours() + start.getMinutes() / 60;
          const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          const colors = [
            { color: "#3B82F6", bgColor: "#DBEAFE" },
            { color: "#22C55E", bgColor: "#DCFCE7" },
            { color: "#A855F7", bgColor: "#F3E8FF" },
            { color: "#F59E0B", bgColor: "#FEF3C7" },
            { color: "#EC4899", bgColor: "#FCE7F3" },
          ];
          const c = colors[i % colors.length];
          return {
            id: e.id || `cal-${i}`,
            title: e.summary || "Untitled",
            time: `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
            dayIndex,
            startHour: Math.max(9, Math.min(17, startHour)),
            duration: Math.max(0.25, Math.min(4, duration)),
            ...c,
            location: e.location,
          };
        });
        setEvents(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setEventsLoaded(true);
    }
  }
  fetchCalendarEvents();
}, []);
```

Then replace the references to the old `EVENTS` constant:
- Line 85: `const visibleEvents = expanded ? events : events.filter(...)` (use state `events`)
- Line 84: same for `visibleDays` calculation

- [ ] **Step 3: Verify build compiles**

---

### Task 1.3: Replace Fake Mascot Chat with Real AI

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx` (the `MascotChat` function, lines 250-326)

- [ ] **Step 1: Import `useAIChat` and replace the fake `handleSend`**

Replace the `MascotChat` component (lines 250-326) to use the real `useAIChat` hook:

```typescript
import { useAIChat } from "@/hooks/useAIChat";

function MascotChat({ onClose }: { onClose: () => void }) {
    const [message, setMessage] = useState("");
    const { messages: aiMessages, isStreaming, sendMessage: aiSend } = useAIChat();

    const handleSend = (text?: string) => {
        const msg = text || message;
        if (!msg.trim()) return;
        setMessage("");
        aiSend(msg);
    };

    // Map AI messages to display format
    const chatMessages = aiMessages.length > 0
        ? aiMessages.map((m) => ({ from: m.role === "user" ? "user" as const : "ai" as const, text: m.content }))
        : [{ from: "ai" as const, text: "Hey! Need help with anything? I can prep you for meetings, find docs, or start a room." }];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[4px_4px_0_#0A0A0A] w-[300px] flex flex-col overflow-hidden"
            style={{ maxHeight: 360 }}
        >
            <div className="flex items-center justify-between border-b-2 border-[#0A0A0A] px-4 py-2.5 bg-[#FFE600]">
                <span className="text-sm font-bold" style={{ fontFamily: "var(--font-heading)" }}>🤖 Yoodle AI</span>
                <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} onClick={onClose}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0A0A0A] bg-white text-[8px] font-bold">✕</motion.button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.from === "user"
                            ? "bg-[#FFE600] border border-[#0A0A0A] text-[#0A0A0A]"
                            : "bg-[#0A0A0A]/5 text-[#0A0A0A]/70"}`}>
                            {msg.text || (isStreaming && msg.from === "ai" ? <span className="animate-pulse">Thinking...</span> : "")}
                        </div>
                    </div>
                ))}
            </div>
            <div className="px-3 pb-1 flex gap-1 overflow-x-auto">
                {["Summarize my day", "Start a room"].map((s) => (
                    <button key={s} onClick={() => handleSend(s)} disabled={isStreaming}
                        className="flex-shrink-0 rounded-full border border-[#0A0A0A]/10 px-2.5 py-1 text-[10px] text-[#0A0A0A]/40 hover:bg-[#FFE600]/10 transition-colors whitespace-nowrap disabled:opacity-50">{s}</button>
                ))}
            </div>
            <div className="border-t border-[#0A0A0A]/10 px-3 py-2">
                <div className="flex items-center gap-2 rounded-full border border-[#0A0A0A]/20 px-3 py-1.5">
                    <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !isStreaming && handleSend()}
                        placeholder="Ask anything..." className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#0A0A0A]/20" disabled={isStreaming} />
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleSend()} disabled={isStreaming}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FFE600] border border-[#0A0A0A] disabled:opacity-50">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="3"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}
```

- [ ] **Step 2: Also update the initial mascot message on Dashboard (line 21) to be dynamic**

Replace line 21 in `Dashboard.tsx`:
```typescript
const [mascotMsg, setMascotMsg] = useState("Hey! I can help you prep for meetings, find docs, or create a room. 🎯");
```

- [ ] **Step 3: Verify build compiles**

---

## Chunk 2: Auth Security Hardening

### Task 2.1: Add Rate Limiting to Login and Signup

**Files:**
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/signup/route.ts`

- [ ] **Step 1: Add rate limiting to login route**

In `src/app/api/auth/login/route.ts`, add import and call at the top of the POST handler:

```typescript
// Add import at top:
import { checkRateLimit } from "@/lib/api/rate-limit";

// Add as first line inside POST handler (line 18):
await checkRateLimit(request, "auth");
```

- [ ] **Step 2: Add rate limiting to signup route**

In `src/app/api/auth/signup/route.ts`, same pattern:

```typescript
// Add import at top:
import { checkRateLimit } from "@/lib/api/rate-limit";

// Add as first line inside POST handler (line 24):
await checkRateLimit(request, "auth");
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/login/route.ts src/app/api/auth/signup/route.ts
git commit -m "security: add rate limiting to login and signup endpoints"
```

---

### Task 2.2: Fix User Enumeration on Login

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Return generic message for both existing and non-existing users**

Replace lines 47-50 in `src/app/api/auth/login/route.ts`:

```typescript
// OLD:
if (!user) {
  return notFoundResponse(
    "No account found with this email. Please sign up first."
  );
}

// NEW — return success even if user doesn't exist (prevents enumeration):
if (!user) {
  // Return same success response to prevent user enumeration
  return successResponse({
    message: "If an account exists with this email, a magic link has been sent.",
  });
}
```

And also change the success response after sending the magic link to use the same generic message.

- [ ] **Step 2: Commit**

---

### Task 2.3: Fix DELETE /session Token Blacklisting

**Files:**
- Modify: `src/app/api/auth/session/route.ts`

- [ ] **Step 1: Add token blacklisting to DELETE handler**

In `src/app/api/auth/session/route.ts`, update the DELETE handler (lines 48-72) to blacklist the access token:

```typescript
import { tokenBlacklist } from "@/lib/redis/cache";

export const DELETE = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  try {
    const payload = await authenticateRequest(req);
    await connectDB();

    // Blacklist the access token (15 min TTL)
    const accessToken = req.cookies.get("yoodle-access-token")?.value;
    if (accessToken) {
      await tokenBlacklist.add(accessToken, 15 * 60);
    }

    // Blacklist the refresh token (7 day TTL)
    const refreshToken = req.cookies.get("yoodle-refresh-token")?.value;
    if (refreshToken) {
      await tokenBlacklist.add(refreshToken, 7 * 24 * 60 * 60);
    }

    await User.findByIdAndUpdate(payload.userId, {
      $unset: { refreshTokenHash: 1 },
      $set: { status: "offline" },
    });
  } catch {
    // Even if auth fails, we still clear cookies
  }

  const response = successResponse({
    message: "Logged out successfully.",
  });

  response.cookies.delete("yoodle-access-token");
  response.cookies.delete("yoodle-refresh-token");

  return response;
});
```

- [ ] **Step 2: Commit**

---

### Task 2.4: Add Missing Env Vars to Validation

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add REDIS_URL and LiveKit vars to ENV_VARS array**

In `src/lib/env.ts`, add after line 53 (after the Vultr Object Storage bucket):

```typescript
  // Redis
  { key: "REDIS_URL", required: false, description: "Redis connection URL (required for rate limiting, token blacklist, room state)" },

  // LiveKit (SFU video transport)
  { key: "LIVEKIT_URL", required: false, description: "LiveKit server URL" },
  { key: "LIVEKIT_API_KEY", required: false, description: "LiveKit API key" },
  { key: "LIVEKIT_API_SECRET", required: false, description: "LiveKit API secret" },
```

- [ ] **Step 2: Commit**

---

## Chunk 3: Ghost Room Bug Fixes

### Task 3.1: Fix Participant Display Names

**Files:**
- Modify: `src/app/api/ghost-rooms/route.ts`
- Modify: `src/app/api/ghost-rooms/[roomId]/route.ts`

- [ ] **Step 1: In POST /api/ghost-rooms (route.ts), look up user display name before creating room**

In `src/app/api/ghost-rooms/route.ts`, after getting `userId`, look up the user:

```typescript
// After getUserIdFromRequest, add:
import User from "@/lib/db/models/user";

// Inside the handler, before createRoom:
const creator = await User.findById(userId).select("name displayName").lean();
const hostName = creator?.displayName || creator?.name || "Anonymous";

// Then change the createRoom call:
const room = await ephemeralStore.createRoom(userId, hostName, title);
```

- [ ] **Step 2: In GET /api/ghost-rooms/[roomId], look up user name for auto-join**

In `src/app/api/ghost-rooms/[roomId]/route.ts`, at the auto-join code path (line ~51):

```typescript
// Look up user before addParticipant:
const joiner = await User.findById(userId).select("name displayName").lean();
const joinerName = joiner?.displayName || joiner?.name || "Anonymous";

const success = await ephemeralStore.addParticipant(room.roomId, userId, joinerName);
```

- [ ] **Step 3: Commit**

---

### Task 3.2: Fix Message Loss on Consensus Save

**Files:**
- Modify: `src/lib/db/models/meeting.ts` (add `ghostMessages` field)
- Modify: `src/lib/ghost/consensus.ts`

- [ ] **Step 1: Add `ghostMessages` field to Meeting schema**

In `src/lib/db/models/meeting.ts`, add after `recordingId` (line 181):

```typescript
    ghostMessages: [{
      userId: { type: String },
      name: { type: String },
      content: { type: String },
      type: { type: String, enum: ["user", "system"], default: "user" },
      timestamp: { type: Date },
    }],
    ghostNotes: {
      type: String,
      default: "",
    },
```

Also add to the `IMeeting` interface:

```typescript
  ghostMessages?: Array<{
    userId: string;
    name: string;
    content: string;
    type: "user" | "system";
    timestamp: Date;
  }>;
  ghostNotes?: string;
```

- [ ] **Step 2: Update `persistGhostData` in consensus.ts to save messages and notes**

In `src/lib/ghost/consensus.ts`, update the `Meeting.create` call (line 74) to include messages:

```typescript
  const meeting = await Meeting.create({
    code: roomData.code,
    title: roomData.title,
    description: `Ghost room saved by consensus. ${roomData.messages.length} messages, ${roomData.participants.size} participants.`,
    hostId: new mongoose.Types.ObjectId(roomData.hostId),
    participants,
    startedAt: roomData.createdAt,
    endedAt: new Date(),
    status: "ended",
    type: "ghost",
    // Save the actual messages!
    ghostMessages: roomData.messages.map((m) => ({
      userId: m.userId,
      name: m.name,
      content: m.content,
      type: m.type,
      timestamp: m.timestamp,
    })),
    ghostNotes: roomData.notes || "",
    settings: {
      maxParticipants: 25,
      allowRecording: false,
      allowScreenShare: false,
      waitingRoom: false,
      muteOnJoin: false,
    },
  });
```

- [ ] **Step 3: Commit**

---

### Task 3.3: Add Message Cap to Ghost Rooms

**Files:**
- Modify: `src/lib/ghost/ephemeral-store.ts`

- [ ] **Step 1: Add $slice to addMessage**

In `src/lib/ghost/ephemeral-store.ts`, find the `addMessage` method and change the `$push` to include a cap:

```typescript
// In addMessage method, change:
{ $push: { messages: fullMessage } }

// To:
{ $push: { messages: { $each: [fullMessage], $slice: -500 } } }
```

This caps messages at the most recent 500.

- [ ] **Step 2: Commit**

---

### Task 3.4: Add Notes UI to Ghost Rooms

**Files:**
- Modify: `src/app/(app)/ghost-rooms/[roomId]/page.tsx`

- [ ] **Step 1: Add notes textarea and save handler to the ghost room page**

After the GhostChat component in the JSX, add a notes panel:

```tsx
{/* Notes Panel */}
<div className="rounded-2xl border-2 border-[#0A0A0A] bg-white shadow-[3px_3px_0_#0A0A0A] p-4">
  <h3 className="text-sm font-bold text-[#0A0A0A] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
    📝 Shared Notes
  </h3>
  <textarea
    value={notes}
    onChange={(e) => setNotes(e.target.value)}
    onBlur={saveNotes}
    placeholder="Take notes here... they'll be saved if everyone votes to keep this room."
    className="w-full h-32 text-xs text-[#0A0A0A] bg-[#FAFAF8] border border-[#0A0A0A]/10 rounded-xl p-3 resize-none outline-none focus:border-[#FFE600]"
  />
</div>
```

Add the state and handler:

```typescript
const [notes, setNotes] = useState(room?.notes || "");

const saveNotes = async () => {
  try {
    await fetch(`/api/ghost-rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "updateNotes", notes }),
    });
  } catch (err) {
    console.error("Failed to save notes:", err);
  }
};
```

- [ ] **Step 2: Commit**

---

### Task 3.5: Fix Race Condition on Final Vote

**Files:**
- Modify: `src/app/api/ghost-rooms/[roomId]/vote-save/route.ts`

- [ ] **Step 1: Use atomic findOneAndUpdate with consensus check**

Replace the non-atomic sequence with an atomic operation. After calling `voteToSave`, use a single atomic operation that checks consensus and marks room for persistence:

```typescript
// After voteToSave succeeds, use atomic findOneAndUpdate to claim persistence:
const claimedRoom = await GhostRoom.findOneAndUpdate(
  {
    roomId,
    expiresAt: { $gt: new Date() },
    // Only claim if ALL participants have voted (atomic check)
    "participants": { $not: { $elemMatch: { votedToSave: { $ne: true } } } },
    // And room hasn't been claimed yet
    _persistenceClaimed: { $ne: true },
  },
  { $set: { _persistenceClaimed: true } },
  { new: true }
);

if (claimedRoom) {
  // We won the race — persist and destroy
  await persistGhostData(claimedRoom);
  await ephemeralStore.destroyRoom(roomId);
}
```

Note: Also need to add `_persistenceClaimed: { type: Boolean, default: false }` to the ghost-room schema.

- [ ] **Step 2: Commit**

---

## Chunk 4: Calendar & Tasks API Routes

### Task 4.1: Create Tasks API Route

**Files:**
- Create: `src/app/api/tasks/route.ts`

- [ ] **Step 1: Create `src/app/api/tasks/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { listTaskLists, listTasks, createTask, completeTask } from "@/lib/google/tasks";

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();
  const user = await User.findById(userId);

  if (!user?.googleTokens?.accessToken) {
    return successResponse([]);
  }

  try {
    const taskLists = await listTaskLists(user.googleTokens);
    const allTasks = [];
    for (const list of taskLists.slice(0, 5)) {
      const tasks = await listTasks(user.googleTokens, list.id);
      allTasks.push(...tasks.map((t: any) => ({ ...t, listId: list.id, listTitle: list.title })));
    }
    return successResponse(allTasks);
  } catch {
    return successResponse([]);
  }
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
  due: z.string().datetime().optional(),
  listId: z.string().optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();
  const user = await User.findById(userId);

  if (!user?.googleTokens?.accessToken) {
    return successResponse({ error: "Google account not linked" }, 400);
  }

  const body = createTaskSchema.parse(await req.json());

  const task = await createTask(user.googleTokens, {
    title: body.title,
    notes: body.notes,
    due: body.due,
  }, body.listId);

  return successResponse(task, 201);
});
```

- [ ] **Step 2: Commit**

---

## Chunk 5: Dark Mode — Real Theme System

### Task 5.1: Create ThemeProvider

**Files:**
- Create: `src/providers/ThemeProvider.tsx`
- Modify: `src/app/layout.tsx` (wrap with ThemeProvider)
- Modify: `src/app/(app)/settings/page.tsx` (remove "coming soon")

- [ ] **Step 1: Create `src/providers/ThemeProvider.tsx`**

```typescript
"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    // Read saved preference
    const saved = localStorage.getItem("yoodle-theme") as Theme | null;
    if (saved) {
      setThemeState(saved);
      document.documentElement.classList.toggle("dark", saved === "dark");
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("yoodle-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Wrap layout.tsx with ThemeProvider**

In `src/app/layout.tsx`, add `ThemeProvider` as a wrapper around children (inside the existing providers).

- [ ] **Step 3: Update settings page — remove "coming soon" and wire to ThemeProvider**

In `src/app/(app)/settings/page.tsx`, line 136:

```typescript
// Change:
description="Switch to a darker color scheme (coming soon)"
// To:
description="Switch to a darker color scheme"
```

And add `useTheme` integration:

```typescript
import { useTheme } from "@/providers/ThemeProvider";

// Inside component:
const { theme, setTheme } = useTheme();

// Initialize darkMode from theme:
const [darkMode, setDarkMode] = useState(false);
useEffect(() => {
  setDarkMode(theme === "dark");
}, [theme]);

// Update handleSave to also apply theme:
// After the PATCH call succeeds, add:
setTheme(darkMode ? "dark" : "light");
```

- [ ] **Step 4: Add dark mode CSS variables to `globals.css`**

Add a `dark` class rule:

```css
.dark {
  --bg-primary: #0A0A0A;
  --bg-secondary: #1A1A1A;
  --text-primary: #FAFAFA;
  --text-secondary: rgba(250, 250, 250, 0.6);
  --border-color: rgba(250, 250, 250, 0.15);
  --card-bg: #1A1A1A;
  --shadow-color: rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 5: Commit**

---

## Chunk 6: Settings Page Completion

### Task 6.1: Add Google Account Connection Status

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add Connected Accounts section to settings**

After the Security card (line 153), add a Connected Accounts section:

```tsx
{/* Connected Accounts */}
<motion.div variants={itemVariants}>
  <Card className="!p-6">
    <h2 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
      Connected Accounts
    </h2>
    <div className="flex items-center justify-between p-3 rounded-xl border border-[#0A0A0A]/10">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white border border-[#0A0A0A]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        </div>
        <div>
          <p className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>Google</p>
          <p className="text-xs text-[#0A0A0A]/50">
            {user?.hasGoogleAccess ? "Connected — Calendar, Drive, Tasks" : "Not connected"}
          </p>
        </div>
      </div>
      {user?.hasGoogleAccess ? (
        <span className="text-xs font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-full px-3 py-1">Connected</span>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => window.location.href = "/api/auth/google"}>
          Connect
        </Button>
      )}
    </div>
  </Card>
</motion.div>
```

- [ ] **Step 2: Update AuthUser type to include `hasGoogleAccess`**

In `src/providers/AuthProvider.tsx`, add `hasGoogleAccess?: boolean` to the `AuthUser` interface and include it in the session response mapping.

- [ ] **Step 3: Commit**

---

### Task 6.2: Add Avatar Upload

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Create: `src/app/api/users/me/avatar/route.ts`

- [ ] **Step 1: Create avatar upload API route**

```typescript
import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { getPresignedUploadUrl } from "@/lib/vultr/object-storage";

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const key = `avatars/${userId}-${Date.now()}.jpg`;
  const uploadUrl = await getPresignedUploadUrl(key, "image/jpeg");

  return successResponse({ uploadUrl, avatarUrl: `https://${process.env.VULTR_OBJECT_STORAGE_HOSTNAME}/${process.env.VULTR_OBJECT_STORAGE_BUCKET}/${key}` });
});

export const PATCH = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { avatarUrl } = await req.json();

  await connectDB();
  await User.findByIdAndUpdate(userId, { avatarUrl });

  return successResponse({ avatarUrl });
});
```

- [ ] **Step 2: Add avatar section to settings Profile card**

In the settings page, add an avatar preview and upload button above the Display Name field:

```tsx
<div className="flex items-center gap-4 mb-4">
  <div className="relative w-16 h-16 rounded-full border-2 border-[#0A0A0A] overflow-hidden bg-[#FFE600]">
    {user?.avatarUrl ? (
      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
    ) : (
      <div className="w-full h-full flex items-center justify-center text-xl font-bold text-[#0A0A0A]">
        {(user?.displayName || user?.name || "?")[0].toUpperCase()}
      </div>
    )}
  </div>
  <label className="cursor-pointer">
    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
    <span className="text-xs font-bold text-[#0A0A0A]/60 border border-[#0A0A0A]/20 rounded-xl px-3 py-1.5 hover:bg-[#0A0A0A]/5 transition-colors">
      Change photo
    </span>
  </label>
</div>
```

- [ ] **Step 3: Add avatar upload handler**

```typescript
const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    // Get presigned URL
    const urlRes = await fetch("/api/users/me/avatar", { method: "POST", credentials: "include" });
    const { data } = await urlRes.json();

    // Upload to Vultr
    await fetch(data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } });

    // Save avatar URL
    await fetch("/api/users/me/avatar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ avatarUrl: data.avatarUrl }),
    });

    await refreshSession();
  } catch (err) {
    console.error("Avatar upload failed:", err);
  }
};
```

- [ ] **Step 4: Commit**

---

## Summary: Execution Order

All 6 chunks are **independent** and can be executed in parallel by subagents:

| Chunk | Description | Estimated Steps |
|-------|-------------|----------------|
| 1 | Dashboard real data (meetings, calendar, mascot) | 9 steps |
| 2 | Auth security (rate limit, enumeration, blacklist, env) | 8 steps |
| 3 | Ghost room fixes (names, messages, cap, notes, race) | 10 steps |
| 4 | Calendar & Tasks API routes | 2 steps |
| 5 | Dark mode theme system | 5 steps |
| 6 | Settings completion (Google status, avatar) | 7 steps |

After all chunks complete, run a full build verification:
```bash
cd /Users/uditanshutomar/Desktop/Yoodle && npx next build
```

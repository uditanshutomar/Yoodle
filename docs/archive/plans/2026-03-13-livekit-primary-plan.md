# LiveKit-Primary Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate P2P WebRTC entirely — all calls route through LiveKit SFU regardless of participant count.

**Architecture:** Remove ~500 lines of manual RTCPeerConnection management from the room page. LiveKit handles all media negotiation, ICE, TURN, and track management. Socket.io stays for chat, room membership, waiting room, reactions, recording, and hand raise.

**Tech Stack:** LiveKit (livekit-client ^2.17.2, livekit-server-sdk ^2.15.0), Next.js 15 App Router, React 19, TypeScript, Redis, MongoDB/Mongoose

---

### Task 1: Harden LiveKit Transport — null safety + connection quality

**Files:**
- Modify: `src/lib/transport/livekit-transport.ts:171-181`
- Modify: `src/lib/transport/types.ts:25-67`

**Step 1: Add `onConnectionStateChanged` callback to `RoomTransport` interface**

In `src/lib/transport/types.ts`, add after the `onStreamUpdated` definition (line 58-60):

```typescript
  /** Subscribe to connection state changes. */
  onConnectionStateChanged: (cb: (state: ConnectionState) => void) => void;
```

**Step 2: Fix null assertion in `stopScreenShare()`**

In `src/lib/transport/livekit-transport.ts`, replace lines 171-181:

```typescript
  async stopScreenShare(): Promise<void> {
    const local = this.room.localParticipant;
    for (const pub of local.trackPublications.values()) {
      if (
        pub.source === Track.Source.ScreenShare ||
        pub.source === Track.Source.ScreenShareAudio
      ) {
        if (pub.track) {
          await local.unpublishTrack(pub.track.mediaStreamTrack);
        }
      }
    }
  }
```

**Step 3: Add `connectionStateCallbacks` array and `onConnectionStateChanged` implementation**

In `src/lib/transport/livekit-transport.ts`, add to the private fields (after line 66):

```typescript
  private connectionStateCallbacks: ((state: ConnectionState) => void)[] = [];
```

Add the public method (after `onStreamUpdated`, around line 195):

```typescript
  onConnectionStateChanged = (cb: (state: ConnectionState) => void): void => {
    this.connectionStateCallbacks.push(cb);
  };
```

**Step 4: Fire connection state callbacks in `attachRoomListeners`**

In the `ConnectionStateChanged` handler (line 205-207), add the callback dispatch:

```typescript
      .on(RoomEvent.ConnectionStateChanged, (state: LKConnectionState) => {
        this.connectionState = mapConnectionState(state);
        this.connectionStateCallbacks.forEach((cb) => cb(this.connectionState));
      })
```

**Step 5: Add `ConnectionQualityChanged` event forwarding**

In `attachRoomListeners()`, add after the `TrackUnsubscribed` handler (before the closing of the method):

```typescript
      .on(RoomEvent.ConnectionQualityChanged, () => {
        // Forward as a stream update so UI can react to quality changes
        for (const p of this.room.remoteParticipants.values()) {
          const stream = buildStreamForParticipant(p);
          this.streamCallbacks.forEach((cb) => cb(p.identity, stream));
        }
      });
```

**Step 6: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: PASS (or only pre-existing errors unrelated to transport)

**Step 7: Commit**

```bash
git add src/lib/transport/livekit-transport.ts src/lib/transport/types.ts
git commit -m "fix(transport): null-safe stopScreenShare + connection state callback"
```

---

### Task 2: Simplify transport factory — remove P2P mode selection

**Files:**
- Modify: `src/lib/transport/transport-factory.ts`
- Modify: `src/lib/livekit/config.ts`

**Step 1: Rewrite `transport-factory.ts`**

Replace the entire file content:

```typescript
import { isLiveKitConfigured } from "@/lib/livekit/config";
import type { RoomTransport } from "./types";

export type TransportMode = "livekit";

/**
 * All calls use LiveKit. Returns "livekit" if configured,
 * throws if LiveKit is not configured (no P2P fallback).
 */
export function determineTransportMode(): TransportMode {
  if (!isLiveKitConfigured()) {
    throw new Error(
      "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }
  return "livekit";
}

/**
 * Creates a LiveKitTransport instance.
 * Uses dynamic import so livekit-client is only loaded when needed.
 */
export async function createLiveKitTransport(
  livekitUrl: string,
  token: string,
): Promise<RoomTransport> {
  const { LiveKitTransport } = await import("./livekit-transport");
  return new LiveKitTransport(livekitUrl, token);
}
```

**Step 2: Remove `PARTICIPANT_THRESHOLD` from `config.ts`**

In `src/lib/livekit/config.ts`, delete lines 21-22:

```typescript
/** Participant count threshold: P2P below this, LiveKit at or above. */
export const PARTICIPANT_THRESHOLD = 5;
```

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: Errors from `useTransport.ts` (uses old `mode` param) — that's Task 3.

**Step 4: Commit**

```bash
git add src/lib/transport/transport-factory.ts src/lib/livekit/config.ts
git commit -m "refactor(transport): remove P2P mode, LiveKit-only transport"
```

---

### Task 3: Fix useTransport hook — remove P2P short-circuit, fix reinit bug

**Files:**
- Modify: `src/hooks/useTransport.ts`

**Step 1: Rewrite the entire hook**

Replace the full file content. Key changes:
- Remove `mode` parameter entirely — always LiveKit
- Split into two effects: init effect (runs once) + track replacement effect (runs on toggle)
- Remove P2P short-circuit return

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  RoomTransport,
  TransportRoomUser,
  ConnectionState,
} from "@/lib/transport/types";

interface UseTransportOptions {
  meetingId: string;
  localStream: MediaStream | null;
  user: TransportRoomUser;
  enabled: boolean;
}

interface UseTransportReturn {
  transport: RoomTransport | null;
  connectionState: ConnectionState;
  remoteStreams: Map<string, MediaStream>;
  remoteParticipants: TransportRoomUser[];
  participantCount: number;
  error: string | null;
}

/**
 * React hook that manages the LiveKit transport lifecycle.
 *
 * All calls route through LiveKit SFU. The hook separates
 * connection init from track replacement so toggling audio/video
 * does NOT teardown + reconnect.
 */
export function useTransport({
  meetingId,
  localStream,
  user,
  enabled,
}: UseTransportOptions): UseTransportReturn {
  const {
    id: userId,
    name: userName,
    avatar: userAvatar,
    isAudioEnabled: userAudioEnabled,
    isVideoEnabled: userVideoEnabled,
    isScreenSharing: userScreenSharing,
  } = user;
  const [transport, setTransport] = useState<RoomTransport | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [remoteStreams, setRemoteStreams] = useState<
    Map<string, MediaStream>
  >(new Map());
  const [remoteParticipants, setRemoteParticipants] = useState<
    TransportRoomUser[]
  >([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<RoomTransport | null>(null);

  const updateRemoteState = useCallback((t: RoomTransport) => {
    setRemoteStreams(new Map(t.getRemoteStreams()));
    setParticipantCount(t.participantCount);
    setConnectionState(t.connectionState);
  }, []);

  // ── Effect 1: Init LiveKit connection (runs once per meeting) ────
  useEffect(() => {
    if (!enabled || !localStream) return;

    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            roomId: meetingId,
            identity: userId,
            name: userName,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error || "Failed to obtain LiveKit token",
          );
        }

        const { data } = await res.json();
        const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

        if (!livekitUrl) {
          throw new Error("NEXT_PUBLIC_LIVEKIT_URL not configured");
        }

        if (cancelled) return;

        const { createLiveKitTransport } = await import(
          "@/lib/transport/transport-factory"
        );
        const t = await createLiveKitTransport(livekitUrl, data.token);

        if (cancelled) {
          t.leave();
          return;
        }

        t.onParticipantJoined((joined) => {
          setRemoteParticipants((prev) => [...prev, joined]);
          updateRemoteState(t);
        });

        t.onParticipantLeft((leftId) => {
          setRemoteParticipants((prev) =>
            prev.filter((p) => p.id !== leftId),
          );
          updateRemoteState(t);
        });

        t.onStreamUpdated(() => {
          updateRemoteState(t);
        });

        t.onConnectionStateChanged((state) => {
          setConnectionState(state);
        });

        await t.join(meetingId, localStream!, {
          id: userId,
          name: userName,
          avatar: userAvatar,
          isAudioEnabled: userAudioEnabled,
          isVideoEnabled: userVideoEnabled,
          isScreenSharing: userScreenSharing,
        });

        if (cancelled) {
          t.leave();
          return;
        }

        transportRef.current = t;
        setTransport(t);
        updateRemoteState(t);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Transport error",
          );
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (transportRef.current) {
        transportRef.current.leave();
        transportRef.current = null;
        setTransport(null);
        setConnectionState("disconnected");
      }
    };
    // NOTE: Only re-run on meetingId/userId/enabled/localStream identity.
    // Audio/video toggles are handled by Effect 2 via replaceTrack().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, userId, enabled, localStream]);

  // ── Effect 2: Track replacement on audio/video toggle ────────────
  useEffect(() => {
    const t = transportRef.current;
    if (!t || !localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    if (audioTrack) {
      t.replaceTrack("audio", audioTrack).catch((err) => {
        console.warn("Failed to replace audio track:", err);
      });
    }
    if (videoTrack) {
      t.replaceTrack("video", videoTrack).catch((err) => {
        console.warn("Failed to replace video track:", err);
      });
    }
  }, [localStream, userAudioEnabled, userVideoEnabled]);

  return {
    transport,
    connectionState,
    remoteStreams,
    remoteParticipants,
    participantCount,
    error,
  };
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: Errors from room page (still passes `mode` to `useTransport`) — that's Task 7.

**Step 3: Commit**

```bash
git add src/hooks/useTransport.ts
git commit -m "fix(useTransport): remove P2P, split init from track replacement"
```

---

### Task 4: Enhance LiveKit token route — meeting codes + participant limit

**Files:**
- Modify: `src/app/api/livekit/token/route.ts`

**Step 1: Rewrite the token route**

Replace the full file content:

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  isLiveKitConfigured,
} from "@/lib/livekit/config";

const tokenRequestSchema = z.object({
  roomId: z.string().min(1, "Room ID is required."),
  name: z.string().min(1, "Display name is required."),
});

/**
 * POST /api/livekit/token
 *
 * Generate a LiveKit access token. Accepts both MongoDB ObjectId
 * and meeting codes as roomId. Enforces maxParticipants by checking
 * the active LiveKit room size before issuing a token.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  if (!isLiveKitConfigured()) {
    throw new BadRequestError(
      "LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  const body = tokenRequestSchema.parse(await req.json());
  const { roomId, name } = body;

  // ── Look up meeting by ObjectId OR meeting code ────────────────
  await connectDB();
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(roomId);
  const meeting = isObjectId
    ? await Meeting.findById(roomId).lean()
    : await Meeting.findOne({ meetingCode: roomId }).lean();

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  // ── Verify caller is a participant ─────────────────────────────
  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some(
      (p) => p.userId.toString() === userId && p.status === "joined",
    );

  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // ── Enforce maxParticipants via LiveKit room API ───────────────
  const maxParticipants = meeting.maxParticipants || 50;
  const livekitRoomId = meeting._id.toString();

  try {
    const roomService = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    );
    const rooms = await roomService.listRooms([livekitRoomId]);
    if (rooms.length > 0 && rooms[0].numParticipants >= maxParticipants) {
      throw new ForbiddenError(
        `Meeting is full (${maxParticipants} participants).`,
      );
    }
  } catch (err) {
    // If it's our own ForbiddenError, re-throw
    if (err instanceof ForbiddenError) throw err;
    // Otherwise LiveKit API is unreachable — allow join (fail open for availability)
    console.warn("LiveKit RoomService check failed, allowing join:", err);
  }

  // ── Issue token ────────────────────────────────────────────────
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name,
    ttl: "6h",
  });

  token.addGrant({
    roomJoin: true,
    room: livekitRoomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  return successResponse({ token: jwt });
});
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: PASS for this file (RoomServiceClient is in livekit-server-sdk)

**Step 3: Commit**

```bash
git add src/app/api/livekit/token/route.ts
git commit -m "feat(livekit): accept meeting codes, enforce participant limit"
```

---

### Task 5: Redis hardening — TTL on room keys + atomic roomUpdateUser

**Files:**
- Modify: `src/lib/redis/cache.ts`

**Step 1: Add 24-hour TTL constant**

At the top of the file (after line 4), add:

```typescript
const ROOM_TTL = 86400; // 24 hours — crash recovery safety net
```

**Step 2: Add TTL to `roomAddUser`**

After the `hset` call in `roomAddUser` (line 102), add a TTL refresh:

```typescript
    await client.hset(ROOM_KEY(roomId), userId, JSON.stringify(userData));
    await client.expire(ROOM_KEY(roomId), ROOM_TTL);
```

**Step 3: Add TTL to `roomSetMeta`**

After the `set` call in `roomSetMeta` (line 203), change to use TTL:

```typescript
    await client.set(ROOM_META_KEY(roomId), JSON.stringify(meta), "EX", ROOM_TTL);
```

**Step 4: Make `roomUpdateUser` atomic with a Lua script**

Replace the entire `roomUpdateUser` function (lines 169-181) with:

```typescript
/**
 * Atomically update a user's data in a room (partial merge).
 * Uses a Lua script to avoid read-modify-write race conditions.
 */
export async function roomUpdateUser(
  roomId: string,
  userId: string,
  updates: object,
): Promise<void> {
  try {
    const client = getRedisClient();
    const luaScript = [
      "local current = redis.call('HGET', KEYS[1], ARGV[1])",
      "if not current then return 0 end",
      "local obj = cjson.decode(current)",
      "local patch = cjson.decode(ARGV[2])",
      "for k, v in pairs(patch) do obj[k] = v end",
      "redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(obj))",
      "redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))",
      "return 1",
    ].join("\n");

    await client.call(
      "EVAL",
      luaScript,
      1,
      ROOM_KEY(roomId),
      userId,
      JSON.stringify(updates),
      String(ROOM_TTL),
    );
  } catch (err) {
    logger.warn({ err, roomId, userId }, "roomUpdateUser failed");
  }
}
```

**Step 5: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.server.json`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/redis/cache.ts
git commit -m "fix(redis): add room TTL, atomic roomUpdateUser via Lua"
```

---

### Task 6: Remove P2P signaling from backend socket server

**Files:**
- Modify: `src/lib/realtime/backend-socket-server.ts`

**Step 1: Remove OFFER, ANSWER, ICE_CANDIDATE handlers**

Delete the three socket event handlers (lines 382-440 approximately):

- `socket.on(SOCKET_EVENTS.OFFER, ...)` — lines 382-398
- `socket.on(SOCKET_EVENTS.ANSWER, ...)` — lines 401-418
- `socket.on(SOCKET_EVENTS.ICE_CANDIDATE, ...)` — lines 420-440

**Step 2: Remove unused signaling type imports**

At the top of the file, remove the imports for:
- `SignalOfferPayload`
- `SignalAnswerPayload`
- `SignalIceCandidatePayload`

And remove the `isValidSignalPayload` helper function if it exists and is only used by these handlers.

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.server.json`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/realtime/backend-socket-server.ts
git commit -m "refactor(socket): remove P2P signaling handlers (OFFER/ANSWER/ICE)"
```

---

### Task 7: Rewrite room page — remove ~500 lines of P2P code

**Files:**
- Modify: `src/app/(app)/meetings/[meetingId]/room/page.tsx`

This is the largest task. The room page (~1300 lines) contains ~500 lines of P2P WebRTC code.

**Step 1: Remove P2P-related imports and type definitions**

Delete:
- `PeerData` interface
- Any `RTCPeerConnection`, `RTCSessionDescriptionInit`, `RTCIceCandidateInit` references
- Import of `SOCKET_EVENTS.OFFER`, `SOCKET_EVENTS.ANSWER`, `SOCKET_EVENTS.ICE_CANDIDATE` usage

**Step 2: Remove P2P state and refs**

Delete:
- `peersRef` (useRef for RTCPeerConnection map)
- `earlyCandidatesRef` (useRef for buffered ICE candidates)
- `iceServersRef` (useRef for TURN/STUN servers)
- `transportMode` state (useState)
- Any `getIceServers` function

**Step 3: Remove P2P functions**

Delete these functions entirely:
- `getIceServers()` — fetches TURN credentials
- `createPeerConnection()` — creates RTCPeerConnection
- `createOffer()` — creates and sends SDP offer
- `handleOffer()` — handles incoming SDP offer
- `handleAnswer()` — handles incoming SDP answer
- `handleIceCandidate()` — handles incoming ICE candidate
- `replaceVideoTrackInPeers()` — replaces tracks across all peer connections

**Step 4: Remove P2P socket listeners**

Delete socket event listeners for:
- `SOCKET_EVENTS.OFFER`
- `SOCKET_EVENTS.ANSWER`
- `SOCKET_EVENTS.ICE_CANDIDATE`

**Step 5: Remove transport upgrade/fallback effects**

Delete the effect that watches participant count and switches between P2P and LiveKit.

**Step 6: Remove P2P cleanup from unmount**

In the cleanup function, remove any `peersRef.current.forEach(peer => peer.connection.close())` logic.

**Step 7: Update `useTransport` call**

Change from:
```typescript
const { transport, ... } = useTransport({
  meetingId,
  mode: transportMode,
  localStream,
  user: { ... },
  enabled: isJoined,
});
```

To:
```typescript
const { transport, ... } = useTransport({
  meetingId,
  localStream,
  user: { ... },
  enabled: isJoined,
});
```

**Step 8: Rewrite screen share to use transport**

Replace any P2P screen share logic with:

```typescript
const handleStartScreenShare = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    if (transport) {
      await transport.startScreenShare(stream);
    }
    // Track when user stops sharing via browser UI
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      handleStopScreenShare();
    });
  } catch (err) {
    console.warn("Screen share cancelled or failed:", err);
  }
};

const handleStopScreenShare = async () => {
  if (transport) {
    await transport.stopScreenShare();
  }
};
```

**Step 9: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: PASS (with possible unrelated warnings)

**Step 10: Commit**

```bash
git add src/app/(app)/meetings/[meetingId]/room/page.tsx
git commit -m "refactor(room): remove P2P WebRTC code, LiveKit-only media"
```

---

### Task 8: Delete TURN credentials route + clean up socket events

**Files:**
- Delete: `src/app/api/turn-credentials/route.ts`
- Modify: `src/lib/realtime/socket-events.ts`

**Step 1: Delete the TURN credentials route**

```bash
rm src/app/api/turn-credentials/route.ts
```

**Step 2: Remove signaling events from socket-events.ts**

In `src/lib/realtime/socket-events.ts`, delete lines 14-17:

```typescript
  // WebRTC signaling
  OFFER: "signal:offer",
  ANSWER: "signal:answer",
  ICE_CANDIDATE: "signal:ice-candidate",
```

**Step 3: Remove signaling payload types**

Delete the following interfaces from `socket-events.ts` (lines 106-123):

- `SignalOfferPayload`
- `SignalAnswerPayload`
- `SignalIceCandidatePayload`

**Step 4: Search for any remaining references**

Run: `grep -rn "signal:offer\|signal:answer\|signal:ice-candidate\|OFFER\|ANSWER\|ICE_CANDIDATE\|turn-credentials" src/ --include="*.ts" --include="*.tsx"`

Expected: Zero results (or only this plan file).

**Step 5: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json && npx tsc --noEmit --project tsconfig.server.json`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete TURN route + P2P signaling events"
```

---

### Task 9: Clean up room-session to remove transportMode

**Files:**
- Search all files for `transportMode`, `transport-mode`, `TransportMode`, `PARTICIPANT_THRESHOLD`, `p2p`

**Step 1: Find all remaining P2P references**

Run:
```bash
grep -rn "transportMode\|transport-mode\|TransportMode\|PARTICIPANT_THRESHOLD\|\"p2p\"\|'p2p'" src/ --include="*.ts" --include="*.tsx"
```

**Step 2: Fix each reference**

For each file found:
- If it imports `TransportMode` from transport-factory: update the import (type is now just `"livekit"`)
- If it references `transportMode` state: remove it
- If it references `PARTICIPANT_THRESHOLD`: remove the import and usage
- If it has `"p2p"` string literals: remove the P2P code path

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove all remaining P2P/transportMode references"
```

---

### Task 10: Final verification

**Step 1: TypeScript compilation (both configs)**

Run: `npx tsc --noEmit --project tsconfig.json && npx tsc --noEmit --project tsconfig.server.json`
Expected: PASS

**Step 2: Run test suite**

Run: `npx vitest run`
Expected: PASS (some tests may need updates if they reference P2P)

**Step 3: ESLint**

Run: `npx eslint src/ --ext .ts,.tsx --max-warnings=0` or `npm run lint`
Expected: PASS (or only pre-existing warnings)

**Step 4: Verify deleted files are gone**

Run:
```bash
test ! -f src/app/api/turn-credentials/route.ts && echo "TURN route deleted OK"
grep -rn "RTCPeerConnection\|createOffer\|createAnswer\|addIceCandidate" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" && echo "WARN: P2P remnants found" || echo "No P2P remnants OK"
```

**Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: final verification — LiveKit-primary migration complete"
```

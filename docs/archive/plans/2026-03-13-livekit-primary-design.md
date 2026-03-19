# LiveKit-Primary Architecture: Eliminate P2P WebRTC

**Date:** 2026-03-13
**Status:** Approved

## Problem

The dual-transport architecture (P2P for <5 participants, LiveKit SFU for ≥5) has 17 known bugs including broken ICE restart, missing renegotiation handlers, no participant limit enforcement at the signaling layer, and race conditions. The ~800 lines of manual RTCPeerConnection management are the root cause.

## Decision

Eliminate P2P entirely. All calls route through LiveKit SFU regardless of participant count.

## What Changes

### Server-Side

**`/api/livekit/token/route.ts`** — Enhanced
- Accept both MongoDB ObjectId and meeting codes as `roomId`
- Enforce `maxParticipants` by checking active LiveKit room size before issuing token
- Add `canPublishData: true` grant

**`backend-socket-server.ts`** — Simplified
- Remove `signal:offer`, `signal:answer`, `signal:ice-candidate` handlers (~60 lines)
- Keep: room join/leave, chat, reactions, hand raise, recording, waiting room, media state broadcasts

**`src/lib/redis/cache.ts`** — Hardened
- Add 24-hour TTL on all room keys
- Make `roomUpdateUser` atomic via Lua script

**Delete:** `/api/turn-credentials/route.ts` (LiveKit manages its own TURN)

### Client-Side

**`room/page.tsx`** — Major simplification (remove ~500 lines)
- Remove: `peersRef`, `earlyCandidatesRef`, all RTCPeerConnection code, signaling socket listeners, transport mode state, upgrade/fallback effects, ICE server fetching
- Keep: room join/leave via Socket.io, local media, chat, reactions, recording UI
- Rewrite: screen share uses `transport.startScreenShare()`/`stopScreenShare()`, remote streams/participants come from `useTransport`

**`useTransport.ts`** — Fixed
- Remove P2P short-circuit — always initialize LiveKit
- Separate effect dependencies so audio/video toggles use `replaceTrack()` instead of teardown+reconnect

**`transport-factory.ts`** — Simplified
- `determineTransportMode()` always returns `"livekit"`
- Remove `PARTICIPANT_THRESHOLD`

**`livekit-transport.ts`** — Hardened
- Null-check `pub.track` before unpublishing
- Add connection quality event forwarding

### Deleted Files
- `src/app/api/turn-credentials/route.ts`

## Issues Resolved

| # | Issue | How Resolved |
|---|-------|-------------|
| 1 | `onnegotiationneeded` never bound | Eliminated — LiveKit handles negotiation |
| 2 | No participant limit in Socket.io JOIN | Enforced in token route via LiveKit room API |
| 3 | Screen share replaces camera track | LiveKit publishes screen as separate ScreenShare source |
| 4 | Race in createOffer guard | Eliminated — no manual offers |
| 5 | ICE restart is no-op | Eliminated — LiveKit handles ICE |
| 6 | No Redis TTL on room keys | Added 24h TTL |
| 7 | roomUpdateUser race | Atomic Lua script |
| 8 | No signaling error feedback | Eliminated — no manual signaling |
| 9 | Socket reconnection P2P inconsistency | Eliminated — no P2P state |
| 10 | LiveKit token only accepts ObjectId | Accept meeting codes too |
| 11 | useTransport reinits on toggle | Separate effect for track replacement |
| 12 | TURN API key in query string | Eliminated — route deleted |
| 13 | No TURN fallback on Metered error | Eliminated — route deleted |
| 14 | Null assertion on track | Added null check |
| 15 | Early ICE candidates never cleaned | Eliminated — no ICE candidate management |
| 16 | No data channel support | Added canPublishData grant |
| 17 | Duplicate addTrack in ontrack | Eliminated — LiveKit manages tracks |

## What Stays Unchanged
- Socket.io for chat, room membership, waiting room, reactions, recording, hand raise
- MongoDB meeting model and join flow
- Authentication (JWT cookies, realtime session tokens)
- Local media capture and UI controls

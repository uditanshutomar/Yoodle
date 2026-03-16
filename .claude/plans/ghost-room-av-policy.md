# Ghost Room A/V with Conditional Recording/Transcript/MoM

## Problem
Ghost rooms are text-only. User wants them to support video/audio calls, but **recording, transcripts, and MoM must NOT be saved unless ALL participants vote to convert to a regular room**.

## Architecture Decision
**Reuse the existing meeting room infrastructure.** Ghost rooms will create a ghost-type meeting and navigate to the meeting room page for A/V. The meeting room page checks `meeting.type` and blocks recording/transcription for ghost meetings. When consensus converts the room to regular, these features unlock.

This avoids duplicating the entire LiveKit/A/V stack inside the ghost room page.

---

## Step 1: Add "Start Call" to Ghost Room Page

**Modify** `src/app/(app)/ghost-rooms/[roomId]/page.tsx`

- Add a "Start Video Call" button in the ghost room UI
- On click: POST to `/api/ghost-rooms/[roomId]/start-call` to create a ghost-type meeting
- Navigate to `/meetings/[meetingId]/room` with the ghost room context
- The ghost room page continues to exist for text chat/notes/voting alongside the call

**Create** `src/app/api/ghost-rooms/[roomId]/start-call/route.ts`

- Creates a Meeting with `type: "ghost"`, `settings.allowRecording: false`
- Links it to the ghost room via a new `meetingId` field on the GhostRoom model
- Returns the meetingId for navigation
- If a meeting already exists for this ghost room, returns the existing one

---

## Step 2: Add `meetingId` to Ghost Room Model

**Modify** `src/lib/infra/db/models/ghost-room.ts`

- Add `meetingId?: string` field to `IGhostRoom` and the schema
- This links the ghost room to its associated meeting (if a call was started)

---

## Step 3: Block Recording & Transcription for Ghost Meetings

**Modify** `src/app/(app)/meetings/[meetingId]/room/page.tsx`

- Fetch the meeting type along with title/duration/host (already fetching from `/api/meetings/${meetingId}`)
- Add state: `const [meetingType, setMeetingType] = useState<string>("regular")`
- Set from the API response: `if (d.data?.type) setMeetingType(d.data.type)`
- Override permissions for ghost meetings:
  ```
  const canRecord = meetingType === "ghost" ? false : (roomSession?.permissions.allowRecording ?? false);
  ```
- **Disable transcription hook** for ghost meetings: pass a `disabled` flag or conditionally call it
  - Change `useTranscription()` call to pass `meetingType !== "ghost"` as an enable condition
  - The hook already checks `isLivekitConnected` — add an `enabled` param that short-circuits when false

**Modify** `src/hooks/useTranscription.ts`

- Add an `enabled` parameter (default `true`)
- When `enabled === false`, skip all recording/sending logic

---

## Step 4: Block MoM Generation for Ghost Meetings

**Modify** `src/app/api/meetings/[meetingId]/leave/route.ts` (or wherever MoM is triggered)

- Before generating MoM, check `meeting.type`
- If `type === "ghost"`, skip MoM generation entirely

**Check** recording upload endpoint — ensure it rejects uploads for ghost-type meetings as a server-side guard.

---

## Step 5: Update Consensus to Convert Meeting Type

**Modify** `src/lib/ghost/consensus.ts` → `persistGhostData()`

- Instead of creating a NEW meeting, update the EXISTING ghost-type meeting (linked via `meetingId` on the ghost room)
- Set `type: "regular"`, `settings.allowRecording: true`, `settings.allowScreenShare: true`
- Persist `ghostMessages` and `ghostNotes` on the meeting
- This means recording/transcription become available after consensus while still in the call

**Modify** `src/app/api/ghost-rooms/[roomId]/vote-save/route.ts`

- After vote, check consensus
- If all voted AND ghost room has a `meetingId`, update the meeting type to "regular"
- Notify participants in the meeting room (via data channel or polling) that the meeting is now regular

---

## Step 6: Meeting Room Reacts to Type Change

**Modify** `src/app/(app)/meetings/[meetingId]/room/page.tsx`

- The existing 5-second polling of `/api/meetings/${meetingId}` already fetches meeting data
- When `meetingType` changes from `"ghost"` to `"regular"`, the UI automatically unlocks:
  - Recording button becomes available
  - Transcription starts (hook checks type)
  - MoM will be generated on leave
- Show a toast/banner: "Room converted to regular - recording & transcription now available"

---

## Files Summary

| Action | File |
|--------|------|
| Modify | `src/lib/infra/db/models/ghost-room.ts` — add `meetingId` field |
| Create | `src/app/api/ghost-rooms/[roomId]/start-call/route.ts` — creates ghost meeting |
| Modify | `src/app/(app)/ghost-rooms/[roomId]/page.tsx` — add Start Call button |
| Modify | `src/hooks/useTranscription.ts` — add `enabled` param |
| Modify | `src/app/(app)/meetings/[meetingId]/room/page.tsx` — check meeting type, block rec/transcription |
| Modify | `src/lib/ghost/consensus.ts` — update existing meeting instead of creating new |
| Modify | `src/app/api/ghost-rooms/[roomId]/vote-save/route.ts` — convert meeting type on consensus |
| Modify | MoM generation endpoint — skip for ghost type |
| Modify | Recording upload endpoint — reject for ghost type |

## Verification

1. Create ghost room → Start Call → joins meeting room with no Record button, no transcription running
2. All participants vote to save → meeting type changes to regular → Record button appears, transcription starts
3. Leave ghost meeting without consensus → no recording, no transcript, no MoM saved
4. Leave after consensus → MoM generated, recording works if started after conversion

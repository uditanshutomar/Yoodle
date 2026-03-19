# Orphaned Features Frontend Wiring — Design

> 6 backend features with complete API implementations but no frontend surface.
> This design covers wiring each into the existing UI.

---

## Background

A deep audit of 71 API routes against frontend code revealed 6 fully-implemented backend features with zero or partial UI access. Several initially-suspected orphans (admit/deny, transfer host, extend, MoM, task comments) were found to be already wired during closer inspection.

### Confirmed Orphaned Features

| Feature | API Endpoint | What It Does |
|---------|-------------|--------------|
| Meeting Copilot | `GET /api/meetings/{id}/copilot` (SSE) | Real-time AI suggestions during meetings |
| Meeting Analytics | `GET /api/meetings/{id}/analytics` | Per-meeting metrics (score, speaker stats, highlights) |
| Meeting Brief | `GET/POST /api/meetings/{id}/brief` | Pre-meeting AI context (agenda, carryovers, sources) |
| Analytics Trends | `GET /api/meetings/analytics/trends` | Cross-meeting patterns and aggregated stats |
| Analytics Summary | `POST /api/analytics/summary` | Admin platform overview (users, meetings, event breakdown) |
| Workspaces | 4 endpoints (CRUD + members + audit) | Team workspace management |

---

## 1. Meeting Copilot Panel

**Where:** Meeting room — new right-side slide-out panel.

**New files:**
- `src/components/meeting/CopilotPanel.tsx`

**Modified files:**
- `src/components/meeting/MeetingControls.tsx` — add Copilot button
- `src/app/(app)/meetings/[meetingId]/room/page.tsx` — add state + panel rendering

**Control bar button:**
- Sparkles icon, placed between Participants and Layout buttons
- Badge shows count of unread suggestions
- Toggles `showCopilot` state

**Panel design:**
- Width: `w-[340px]` desktop, full-width mobile (matches ChatPanel pattern)
- Position: absolute right, top-0 bottom-0, z-30
- Header: "Copilot" + connection status indicator (green dot = connected, yellow = reconnecting)
- Body: scrollable list of AI suggestion cards, each with timestamp
- Subscribes to SSE at `GET /api/meetings/{meetingId}/copilot`
- Auto-reconnect on disconnect (EventSource handles this natively)
- Available to all participants, not host-only

**State management:**
```
showCopilot: boolean
copilotMessages: { id, type, text, timestamp }[]
unreadCopilotCount: number (resets when panel opens)
```

---

## 2. Meeting Analytics Tab

**Where:** MeetingDetail drawer — new 5th tab.

**Modified files:**
- `src/components/dashboard/MeetingDetail.tsx` — add "analytics" tab

**Tab definition:**
- Label: "Analytics" with bar-chart icon
- Disabled when no analytics record exists (`!analyticsData`)
- Fetches `GET /api/meetings/{meetingId}/analytics` on tab selection

**Tab content layout:**
1. **Score ring** — circular progress (0-100), color: red (<40), yellow (40-70), green (>70)
2. **Score breakdown** — 4 labeled horizontal bars:
   - Agenda coverage
   - Decision density
   - Action item clarity
   - Participation balance
3. **Speaker stats** — horizontal stacked bars per participant:
   - Name + talk time % + word count
   - Sorted by talk time descending
4. **Highlights timeline** — vertical list of timestamped moments:
   - Type badge (decision / disagreement / commitment / key_point)
   - Highlight text
5. **Stats row** — 3 compact numbers: decisions, action items created, action items completed

---

## 3. Meeting Brief

**Where:** Two locations — pre-join lobby (primary) and MeetingDetail drawer (secondary).

### 3a. Pre-Join Lobby Integration

**Modified files:**
- `src/app/(app)/meetings/[meetingId]/page.tsx` — add brief section

**Placement:** Below device preview / Join button area, collapsible section.

**Behavior:**
- Fetches `GET /api/meetings/{meetingId}/brief` on mount
- Status states:
  - No brief exists → "Generate Brief" button (calls `POST /brief`)
  - `status: "generating"` → spinner with "Preparing brief..."
  - `status: "ready"` → show content
  - `status: "stale"` → show content + "Refresh" button

**Content display:**
- **Agenda suggestions** — bulleted list
- **Carryover items** — task text + source meeting title
- **Relevant sources** — type icon (task/email/doc/MoM/calendar) + title + truncated summary
- **Google Doc link** — if `googleDocUrl` exists, external link button

### 3b. MeetingDetail Tab

**Modified files:**
- `src/components/dashboard/MeetingDetail.tsx` — add "brief" tab (6th tab)

Same content display as lobby, but read-only (no "Generate" button — brief is pre-meeting artifact). Disabled when no brief exists.

---

## 4. Analytics Trends Dashboard Widget

**Where:** Dashboard right column, between Action Item Tracker and AI Briefing card.

**New files:**
- `src/components/dashboard/MeetingTrendsCard.tsx`

**Modified files:**
- `src/components/dashboard/Dashboard.tsx` — add MeetingTrendsCard to right column

**Design:**
- Standard dashboard card styling (`rounded-2xl border-2 shadow-[var(--shadow-card)]`)
- Header: "Meeting Trends" + chart icon + range selector dropdown (Week / Month / Quarter)
- **Stats row** — 4 compact metrics inline:
  - Total meetings
  - Avg score (0-100)
  - Total decisions
  - Total action items
- **Patterns list** — AI-detected patterns from API, each as a compact row:
  - Severity dot (info=blue, warning=yellow, critical=red)
  - Pattern message text
- Fetches `GET /api/meetings/analytics/trends?range=month` on mount
- Re-fetches when range changes
- Loading skeleton, empty state ("No meeting data yet")

---

## 5. Admin Analytics Summary

**Where:** Existing admin page — replace/enhance current stats.

**Modified files:**
- `src/app/(app)/admin/page.tsx` — wire to `/api/analytics/summary`

**Changes:**
- Replace hardcoded or basic stats with real API data
- Wire existing stat cards to use `overview.totalUsers`, `overview.totalMeetings`, `overview.activeMeetings`
- Add 7d vs 30d meeting trend comparison row
- Add event breakdown as a simple categorized list

Small wiring change, not a new page.

---

## 6. Workspaces — Settings Page Integration

**Where:** Settings page — new "Workspaces" section.

**New files:**
- `src/components/settings/WorkspaceSection.tsx`
- `src/hooks/useWorkspaces.ts`

**Modified files:**
- `src/app/(app)/settings/page.tsx` — add WorkspaceSection

**`useWorkspaces` hook:**
- `workspaces[]` — list from `GET /api/workspaces`
- `createWorkspace(name, description)` — `POST /api/workspaces`
- `updateWorkspace(id, data)` — `PATCH /api/workspaces/{id}`
- `deleteWorkspace(id)` — `DELETE /api/workspaces/{id}`
- `members[]` — from `GET /api/workspaces/{id}/members`
- `addMember(email, role)` — `POST /api/workspaces/{id}/members`
- `removeMember(memberId)` — `DELETE /api/workspaces/{id}/members?memberId=`
- `auditLogs[]` — from `GET /api/workspaces/{id}/audit`

**UI layout:**
- **Workspace list** — cards showing name, role badge (owner/admin/member), member count
- **Create workspace** — button opens inline form (name + description inputs)
- **Workspace detail** (click to expand):
  - Edit name/description (admin/owner only)
  - Members list with role badges
  - "Add member" — email input + role selector (admin only)
  - "Remove" button per member (admin only, not on owner)
  - Auto-shutdown settings toggle + minutes input
  - Audit log — collapsible table (admin only)
  - "Delete workspace" — red button with confirmation modal (owner only)

No sidebar workspace switcher — workspaces don't currently scope data. Switcher deferred to when workspace-scoped filtering is implemented on the backend.

---

## Files Summary

| Action | File | Feature |
|--------|------|---------|
| **Create** | `src/components/meeting/CopilotPanel.tsx` | Copilot |
| **Create** | `src/components/dashboard/MeetingTrendsCard.tsx` | Trends |
| **Create** | `src/components/settings/WorkspaceSection.tsx` | Workspaces |
| **Create** | `src/hooks/useWorkspaces.ts` | Workspaces |
| **Modify** | `src/components/meeting/MeetingControls.tsx` | Copilot button |
| **Modify** | `src/app/(app)/meetings/[meetingId]/room/page.tsx` | Copilot state + panel |
| **Modify** | `src/components/dashboard/MeetingDetail.tsx` | Analytics + Brief tabs |
| **Modify** | `src/app/(app)/meetings/[meetingId]/page.tsx` | Brief in lobby |
| **Modify** | `src/components/dashboard/Dashboard.tsx` | Trends card |
| **Modify** | `src/app/(app)/admin/page.tsx` | Analytics summary |
| **Modify** | `src/app/(app)/settings/page.tsx` | Workspaces section |

## Implementation Order

1. **Copilot Panel** — biggest single feature gap, core meeting experience
2. **Analytics Tab** — completes the post-meeting loop in MeetingDetail
3. **Brief** — lobby integration + MeetingDetail tab
4. **Trends Widget** — dashboard enhancement
5. **Admin Summary** — small wiring fix
6. **Workspaces** — largest new UI surface, lowest urgency

# AI Search, Smart Notifications & Blueprints — Design Doc

**Date:** 2026-03-19
**Status:** Approved

---

## Feature 1: AI-Powered Command Palette (⌘K)

### Goal
Global search that routes natural language queries through existing search infrastructure and returns unified results.

### Architecture
- **New API:** `POST /api/search` — fans out query to existing search functions (users, messages, meetings, tasks, drive) via `Promise.allSettled`, returns grouped results
- **New Component:** `CommandPalette.tsx` — Radix Dialog modal with keyboard navigation
- **Trigger:** `⌘K` / `Ctrl+K` global shortcut + topbar badge click
- **No new MongoDB indexes** — reuses existing text indexes and search functions

### Result Categories
| Category | Source | Icon | Click Action |
|----------|--------|------|-------------|
| Meetings | Meeting model (title search) | Video | Navigate to `/meetings/{id}` |
| Messages | DirectMessage text index | MessageCircle | Navigate to `/messages/{conversationId}` |
| Tasks | BoardTask model (title/description) | CheckSquare | Navigate to `/board` |
| People | User model (name/displayName) | User | Navigate to `/messages` (start DM) |
| Drive Files | Google Drive API | FileText | Open Drive URL |

### UI Behavior
- Debounced input (300ms)
- Keyboard navigation: ↑↓ to select, Enter to navigate, Escape to close
- Recent searches stored in localStorage (last 5)
- Empty state: "Search across meetings, messages, tasks, and more"
- Loading state: skeleton rows per category
- Results grouped by category with section headers

---

## Feature 2: Smart Notification System

### Goal
In-app notification system with real-time delivery and AI-powered priority filtering.

### Data Model
```
Notification {
  userId: ObjectId (indexed)
  type: enum [mention, reply, meeting_invite, meeting_starting, task_assigned, task_due, ai_action_complete, ghost_room_expiring]
  title: String
  body: String
  sourceType: enum [meeting, message, task, ai]
  sourceId: String
  read: Boolean (default false, indexed)
  priority: enum [urgent, normal, low]
  createdAt: Date (TTL index: 30 days)
}
```

### API Routes
- `GET /api/notifications` — paginated, unread count in response headers
- `PATCH /api/notifications/[id]` — mark read
- `POST /api/notifications/read-all` — bulk mark read
- `GET /api/notifications/stream` — SSE endpoint via Redis pub/sub on `notifications:{userId}`

### Real-Time Delivery
- Redis channel: `notifications:{userId}`
- Reuses existing SharedSubscriber infrastructure
- SSE endpoint follows same pattern as conversation stream

### Trigger Points
| Event | Priority | Where to Publish |
|-------|----------|-----------------|
| @mention in message | urgent | Message send API |
| Meeting invite | urgent | Meeting create API |
| Meeting starting (5min) | urgent | Cron/proactive endpoint |
| Task assigned to you | normal | Task create/update API |
| AI action completed | normal | AI action confirm API |
| Task due soon | low | Cron/proactive endpoint |
| Ghost room expiring | low | Ghost room TTL check |

### UI
- Bell icon in AppTopbar with red unread badge
- Dropdown panel (Radix Popover): notification list with mark-read, clear-all
- Each notification: icon + title + body + relative time + read indicator
- Click navigates to source (meeting, message, task)

### Smart Filtering (v1 simple)
- Urgent: push immediately via SSE
- Normal: deliver in real-time but no special attention
- Low: batch — only show in panel, no badge increment
- User can toggle notifications on/off in Settings (existing preference)

---

## Feature 3: Blueprints Tab Fix

### Goal
Connect the existing "Blueprints" empty state to the already-built templates system.

### Change
Replace the "Coming Soon" empty state in `MeetingsClient.tsx` Blueprints tab with the template list from `/meetings/templates`, or link to it.

---

## Implementation Order
1. Blueprints tab fix (5 min)
2. Command Palette — API + Component + integration (medium)
3. Notification Model + API + SSE stream (medium)
4. Notification UI — bell, dropdown, hooks (medium)
5. Notification triggers — wire into existing APIs (medium)

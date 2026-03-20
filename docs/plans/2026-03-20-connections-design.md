# Connections ("Your Circle") — Design Doc

**Date:** 2026-03-20
**Status:** Approved

## Overview

A dedicated Connections feature that lets Yoodle users send mutual connection requests via email. Connections become the single source of truth for lockin mode visibility on the map (replacing workspace-based filtering). Since Gmail is required for login, every user's email is already available — making it easy to connect and powering downstream features like meeting invites and AI suggestions.

## Data Model

### Connection (new Mongoose model)

```
Connection {
  requesterId:  ObjectId (ref: User)   — who sent the request
  recipientId:  ObjectId (ref: User)   — who receives it
  status:       "pending" | "accepted" | "blocked"
  createdAt:    Date (default: now)
  updatedAt:    Date (default: now)
}
```

**Indexes:**
- `{ requesterId: 1, recipientId: 1 }` — unique compound (prevents duplicate requests)
- `{ recipientId: 1, status: 1 }` — "show me my pending/accepted requests"
- `{ requesterId: 1, status: 1 }` — "show me my sent/accepted requests"

**Constraints:**
- No relationship types — just "Connection"
- `blocked` prevents future requests from that user
- No self-connections

### Notification Model Update

Add `"connection_request"` to the notification `type` enum. Source type: `"connection"`.

## API Routes

| Method   | Route                       | Purpose                                    |
|----------|-----------------------------|--------------------------------------------|
| `POST`   | `/api/connections`          | Send request (body: `{ email }`)           |
| `GET`    | `/api/connections`          | List connections (`?status=accepted\|pending\|blocked`) |
| `GET`    | `/api/connections/requests` | Incoming pending requests                  |
| `PATCH`  | `/api/connections/[id]`     | Accept or block (`{ action: "accept" \| "block" }`) |
| `DELETE` | `/api/connections/[id]`     | Remove connection or cancel sent request   |

### POST /api/connections
- Looks up user by email
- Prevents: duplicate requests, self-requests, requests to/from blocked users
- Creates Connection with status "pending"
- Fires `connection_request` notification via Redis pub/sub
- Returns the created connection

### GET /api/connections
- Returns connections where user is requester OR recipient
- Filterable by `?status=accepted` (default), `pending`, `blocked`
- Populates user info (name, displayName, avatarUrl, status)

### GET /api/connections/requests
- Returns pending connections where user is the recipient
- Populates requester info

### PATCH /api/connections/[id]
- Accepts `{ action: "accept" | "block" }`
- Only the recipient can accept/block
- Atomic update with status filter (TOCTOU safe)

### DELETE /api/connections/[id]
- Requester can cancel pending requests
- Either party can remove accepted connections
- Removes the Connection document entirely

## Nearby API Update

`GET /api/users/nearby` — lockin mode filter updated:
- **Before:** Query workspace members, filter $geoNear by workspace mate IDs
- **After:** Query accepted Connections for current user, filter $geoNear by connection IDs
- Coordinate blurring for lockin users remains unchanged

## Frontend

### Connections Page (`/connections`)

**Route:** `/connections` — new sidebar item with `Users` icon

**Layout:** Simple list with 3 tabs:
- **Yoodlers** — accepted connections (the squad)
- **Incoming** — pending requests waiting for vibe check, with badge count
- **Sent** — outgoing pending requests

**Top bar:** Email input with placeholder "Add someone by email" + "Send Yoodle" button (yellow, neo-brutalist)

**Actions:**
- Accept: "Accept" (yellow fill)
- Decline: "Nah"
- Remove connection: "Remove"
- Cancel sent: "Unsend"

**Empty states:**
- Yoodlers: "No Yoodlers yet. Send your first Yoodle request!"
- Incoming: "No pending vibes. You're all caught up."
- Sent: "You haven't sent any Yoodle requests yet."

**Styling:** Neo-brutalist — 2px borders, offset shadows, yellow accent for active tab.

### Map HoverCard Update

If viewing a user you're not connected to, show a "Yoodle" button that sends a connection request directly (email is already known from their profile data).

### Notification Integration

Incoming connection requests appear in the notification bell. Clicking navigates to `/connections` with the Incoming tab active.

## Hook

`useConnections()` — client-side hook for fetching and managing connections:
- `connections` — list of accepted connections
- `requests` — incoming pending requests
- `sendRequest(email)` — send a Yoodle request
- `acceptRequest(id)` — accept incoming
- `declineRequest(id)` — decline (delete)
- `removeConnection(id)` — remove accepted
- `cancelRequest(id)` — unsend pending

## Testing

- Connection model: CRUD operations, duplicate prevention, blocked user guards
- API routes: auth, validation, status transitions, notification firing
- Nearby API: verify lockin uses connections instead of workspace
- Frontend: tab switching, request flow, empty states

# Map Feature & Social Modes — Design Document

## Goal

Add a full-screen map page where Yoodle users can see each other's locations, with three character-driven social modes (Ninja, LockedIn, Social) that control visibility and privacy — all built on the existing backend infrastructure.

## Architecture

The map is a new `/map` route using `@vis.gl/react-google-maps` (already installed). Three mascot-driven modes reuse the existing `user.mode` enum (`invisible | lockin | social`) and `MASCOT_BY_MODE` constant. Location syncing uses the existing `useGeolocation` hook (60s interval) and `/api/users/nearby` endpoint (`$geoNear` aggregation). Nearby users are polled every 30s via a new `useNearbyUsers` hook using the existing `useBroadcastPoll` pattern.

## Tech Stack

- `@vis.gl/react-google-maps` v1.7.1 (installed, API key configured)
- Existing: `useGeolocation`, `/api/users/nearby`, `/api/users/me`, `MASCOT_BY_MODE`
- Framer Motion for animations, Radix UI for dropdowns
- Neo-brutalist design: 2px borders, offset shadows, #FFE600 yellow accent

---

## The Three Modes

| Mode | Mascot Asset | Who Sees You | Location Precision | Backend `mode` Value |
|------|-------------|-------------|-------------------|---------------------|
| **Ninja** | `/mascot-invisible.png` (dog in ninja outfit) | Nobody | Hidden entirely | `"invisible"` |
| **LockedIn** | `/mascot-lockin.png` (dog with headphones) | Workspace mates only | City-level (~5km blur) | `"lockin"` |
| **Social** | `/mascot-social.png` (dog with boba tea) | Everyone on Yoodle | Exact pin | `"social"` |

### Mode Behavior Rules

- **Ninja:** User excluded from all `/api/users/nearby` results. No pin on anyone's map. Status hidden.
- **LockedIn:** User returned only to requesters who share a workspace. Coordinates blurred server-side (random ±5km offset). Status visible to workspace mates.
- **Social:** User returned to everyone. Exact coordinates. Status visible to all.
- **Your own pin** is always visible to you regardless of mode.

---

## Page Layout

**Route:** `/map` — new sidebar entry between Board and Calendar.

```
[Sidebar] | Full-bleed Google Map (dark/night style)
          |   - User pins with avatars
          |   - Cluster badges at low zoom
          |   - Hover cards on pin interaction
          |
          |   [Mode Switcher] ← floating bottom-left
          |   [Status Editor] ← below mode switcher
```

---

## Component Tree

```
src/app/(app)/map/page.tsx              — route entry
└── MapClient.tsx                        — "use client" wrapper
    ├── GoogleMapView.tsx                — full-bleed map with dark style
    │   ├── UserPin.tsx                  — avatar + pulse + mode badge
    │   ├── PinCluster.tsx              — grouped pins at low zoom
    │   └── HoverCard.tsx               — popup: name, status, wave/chat
    ├── ModeSwitcher.tsx                 — 3 mascot cards, floating panel
    │   └── StatusEditor.tsx            — inline editable status text
    └── MapEmptyState.tsx               — "Be the first to drop a pin!"
```

### New Hooks

```
src/hooks/useNearbyUsers.ts             — polls /api/users/nearby every 30s
src/hooks/useUserMode.ts                — reads/switches mode via /api/users/me
```

---

## Mode Switcher UI

Floating bottom-left panel with three side-by-side cards:

- Each card shows the mascot image (48x48, `mix-blend-multiply`) and mode label
- Active card: yellow (#FFE600) fill + 4px offset shadow + mascot bounce animation
- Inactive cards: white bg, 2px black border, muted
- Click to switch — optimistic UI update, PATCH to `/api/users/me`
- Status text field below (click-to-edit, max 60 chars) — hidden in Ninja mode
- **Collapsed state:** Active mascot as 48px floating circle button, tap to expand

---

## Pin Design

| Viewer Sees... | Pin Style |
|----------------|-----------|
| Social user | Avatar + yellow border + green pulse ring + exact location |
| LockedIn user (workspace mate viewing) | Avatar + dashed border + blue headphone badge + city-level blob |
| Ninja user | Not rendered (excluded from API results) |
| You (any mode) | Your pin always visible, "You" label, blue accent ring |

### Pin Interactions

- **Hover:** Neo-brutalist card (2px border, 4px shadow) with name, status, workspace badge
- **Wave button:** Sends lightweight notification ("X waved at you from the map!")
- **Chat button:** Opens existing Chatter DM or starts new one
- **Clustering:** Pins that overlap → numbered yellow cluster badge, click to expand with staggered radial fan-out

---

## Data Flow

```
useGeolocation (60s) ──> PATCH /api/users/me {location}
                              │
                         MongoDB User {location, mode}
                              │
useNearbyUsers (30s) ──> GET /api/users/nearby?lng&lat&radiusKm
                              │
                         $geoNear aggregation
                         • social → returned to everyone
                         • lockin → returned to workspace mates, coords blurred ±5km
                         • invisible → excluded
                              │
                         GoogleMapView renders pins

ModeSwitcher (click) ──> PATCH /api/users/me {mode}
                         optimistic update + re-trigger nearby poll

HoverCard "Wave" ────> POST /api/notifications/wave {targetUserId}
                       → Redis pub/sub notification
```

---

## API Changes

### Modified: `GET /api/users/nearby`

- Add workspace filtering for `lockin` mode users (only return to workspace mates)
- Add server-side coordinate blurring for `lockin` users (random ±5km offset)
- No changes needed for `social` or `invisible` filtering (already works)

### New: `POST /api/notifications/wave`

- Lightweight endpoint: inserts a wave notification
- Uses existing Redis pub/sub (`sharedSubscriber`) for instant delivery via SSE
- Rate limited to prevent spam (e.g., max 5 waves per user per minute)

### No Changes Needed

- `PATCH /api/users/me` — already accepts `mode`, `status`, `location`
- User model — already has `mode`, `status`, `location` with 2dsphere index
- `MASCOT_BY_MODE` constant — already maps all three modes to assets

---

## Animations (Framer Motion)

- **Pin drop-in:** Spring animation (`bounce: 0.4`)
- **Hover card:** Slide up `y: 10→0, opacity: 0→1` (150ms)
- **Mode switch:** Active card scale `1→1.05` with spring, mascot bounce
- **Wave button:** Wiggle animation on click before sending
- **Cluster expand:** Staggered radial fan-out on click
- **Panel collapse/expand:** Height transition with content fade

---

## Key Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Polling vs SSE for nearby | Polling (30s) | Matches `useBroadcastPoll` pattern, location is not real-time critical |
| Coord blur location | Server-side | Privacy enforced at API, never trust client |
| Wave delivery | Redis pub/sub → SSE | Reuses existing `sharedSubscriber` infra |
| Map library | @vis.gl/react-google-maps | Already installed + API key configured |
| Mode storage | Existing `user.mode` field | Zero migration, `MASCOT_BY_MODE` maps it |
| Mascot assets | Existing PNGs in /public | Already have all three mode illustrations |
| Map style | Google dark/night mode | Yoodle yellow accent pops on dark background |

# Product Redesign — Post-Login Experience

**Date:** 2026-03-16
**Approach:** Cohesive Rethink (Approach B)
**Scope:** Everything after login. Landing page, auth, and waitlist unchanged.
**Constraints:** Keep mascot character and doodle-sketch visual identity. Remove Workspaces feature entirely.

---

## 1. Navigation & Layout Shell

**Sidebar (desktop):** 4 items — Home, Meetings, Messages, Settings.
- Ghost Rooms moves under Meetings as a tab.
- AI moves from `/ai` page to a floating right-side drawer (Cmd+J or mascot FAB).
- Workspaces removed entirely (nav link + all related pages/components).

**Mobile:** Bottom tab bar (Home, Meetings, Messages, Settings) replaces hamburger sidebar. AI drawer triggered by mascot FAB in bottom-right.

**Layout shell:** Topbar stays. Sidebar collapses to icons at `lg` breakpoint, hidden on mobile. Content area gets consistent `px-6 py-6` padding.

---

## 2. Home Dashboard

**Single-column flow** replacing the current cramped 2-column layout:

1. **Action cards** — two prominent cards side-by-side: "Start Meeting" (instant) and "Join Meeting" (code input). Doodle-sketch borders, large tap targets.
2. **AI Briefing card** — 2-3 bullet summary of today (meetings, pending tasks, unread messages). Tap to open AI drawer for details.
3. **Up Next** — today's meetings in chronological order. Each card shows time, title, participants (avatar stack), and a "Join" button when live.
4. **Recent Meetings** — last 3-5 completed meetings with quick links to notes/transcript.
5. **Calendar + Tasks** — side-by-side below the fold, each collapsible. Calendar shows week view; Tasks shows today's items.

**Removed from dashboard:** Floating doodle decorations (visual noise on small screens), TeamMap component.

---

## 3. Meetings Page

**Three tabs:** Upcoming | Past | Ghost Rooms.

**Meeting creation:** Single "New Meeting" button with a dropdown offering three options:
- Instant Meeting (creates and joins immediately)
- Schedule Meeting (inline form or modal)
- Ghost Room (creates ephemeral room)

This replaces the current separate creation flows and dedicated Ghost Room page.

**Meeting cards:** Consistent design across all tabs — status dot (green=live, yellow=scheduled, gray=ended), title, time, participant avatars, action button.

---

## 4. Messages, Settings, AI Drawer

**Messages:** Visual polish only — no structural changes. The existing conversation list + chat panel pattern works well.

**Settings:** Reorganized into grouped sections with clear headers:
- Profile & Appearance
- Notifications
- Meeting Defaults
- Privacy & Security
- Account

Each section is a collapsible card. Current settings content redistributed into these groups.

**AI Drawer:**
- Right-side panel: 400px on desktop, full-screen on mobile.
- Triggered by: mascot FAB (always visible, bottom-right), Cmd+J keyboard shortcut, or "Ask Doodle" links throughout the app.
- Contains the existing chat interface with the AI agent.
- Drawer expands dynamically to accommodate longer responses (up to 600px width, then scrolls internally).
- Overlay on mobile, side panel on desktop (does not push content).

---

## 5. Visual System Refinements

**Typography:**
- Headings: Space Grotesk (bold/black) — scale: 32/24/20/16px.
- Body: Inter — scale: 16/14/13px.
- Monospace for code/meeting-codes: JetBrains Mono.

**Color roles enforced:**
- `--yellow` for primary actions and mascot-related elements only.
- `--surface` / `--surface-secondary` for cards and containers.
- `--border` for all borders (no ad-hoc gray values).
- Status colors: green (live/online), yellow (scheduled/away), red (error/ended), gray (past/offline).

**Unified card component:**
- 2px border using `--border`, 16px border-radius, hover shadow (`shadow-md`).
- Consistent padding: `p-4` internal, `gap-4` between cards.

**Spacing system:** `px-6` page padding, `gap-4` between sections, `p-4` card internal padding.

**Animations:** Framer Motion page transitions (fade + slight vertical slide). Drawer slides in from right. Cards have subtle hover lift.

**Mobile bottom tab bar:** 4 icons with labels, active state uses `--yellow` tint. Mascot FAB floats above the tab bar.

**Doodle aesthetic:** Lives in component styling (sketch-style borders, hand-drawn icon accents, mascot presence) rather than floating SVG decorations.

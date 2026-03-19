# Product Design Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, high, and medium priority product design issues found during comprehensive UX audit.

**Architecture:** Targeted edits across landing page components, app shell, AI chat system, and legal pages. No new dependencies except `react-focus-lock` for mobile menu focus trap. All changes are CSS/JSX/copy — no API changes needed.

**Tech Stack:** React, Tailwind CSS 4, Framer Motion, Radix UI, Lucide Icons

---

## Batch 1: Critical Fixes (Trust & First Impressions)

### Task 1: Fix Broken Social Links in Footer

**Files:**
- Modify: `src/components/Footer.tsx:9,19`

**Changes:**
- Line 9: `href: "https://x.com"` → `href: "https://x.com/yaboroamern"` (or actual handle)
- Line 19: `href: "https://linkedin.com"` → `href: "https://linkedin.com/in/uditanshutomar"` (or actual profile)

### Task 2: Remove Non-Functional Search & Notification Placeholders

**Files:**
- Modify: `src/components/layout/AppTopbar.tsx:31-57`

**Changes:**
- Replace the search input (lines 31-46) with a subtle "Search coming soon" badge or remove entirely
- Replace the notification bell button (lines 52-57) with nothing, or add a "coming soon" tooltip
- Rationale: Dead UI elements erode trust more than missing ones

### Task 3: Add Error Feedback to AI Action Confirmations

**Files:**
- Modify: `src/components/ai/ChatBubble.tsx:117-211` (InlineActionCard)
- Modify: `src/components/ai/cards/DiffPreviewCard.tsx:19-28`
- Modify: `src/components/ai/cards/DraftCard.tsx:27-37`
- Modify: `src/components/ai/cards/BatchActionCard.tsx:37-49`

**Changes for each file:**
- Add `error` state to component state machine
- On catch: `setError("Something went wrong. Try again.")` instead of silent `console.error`
- Render error message below the action buttons: red text, small, with "Retry" link
- Tool call error: Add `title` attribute to red X icon showing `toolCall.error || "Tool call failed"`

### Task 4: Add Code Block Styling to SafeMarkdown

**Files:**
- Modify: `src/components/ai/SafeMarkdown.tsx`

**Changes:**
- Add `code` and `pre` to the `components` override object
- `pre`: `bg-[var(--surface-hover)] rounded-xl p-4 overflow-x-auto border border-[var(--border)]`
- `code` (inline): `bg-[var(--surface-hover)] rounded px-1.5 py-0.5 text-sm font-mono`
- `code` (in pre block): no extra background, just `font-mono text-sm`

---

## Batch 2: High Priority Fixes (UX & Interaction)

### Task 5: Add Focus Trap to Mobile Nav Menu

**Files:**
- Modify: `src/components/Navbar.tsx:136-197`

**Changes:**
- Install: No new dependency — use `onKeyDown` handler to trap Tab key within menu
- Add `useRef` to menu container, on open focus first link, on Tab at last item wrap to first
- Add Escape key handler to close menu

### Task 6: Remove Misleading Hover Effect from Feature Cards

**Files:**
- Modify: `src/components/Features.tsx:128-133`

**Changes:**
- Remove `whileHover` prop from feature card `motion.div`
- Keep the `whileInView` entrance animation (that's good)
- Remove `cursor-default` (it's not interactive, that's correct)
- Remove `hover:shadow-[2px_2px_0_var(--border-strong)]` from className

### Task 7: Add Timeline to Cloud Pricing

**Files:**
- Modify: `src/components/Pricing.tsx:184-192`

**Changes:**
- Change "Coming Soon" badge text to "2026" or remove the Cloud column entirely
- Add small text under the badge: "Notify me" email capture or just a date

### Task 8: Add Error Recovery Guidance

**Files:**
- Modify: `src/components/chat/ChatThread.tsx:401-417`

**Changes:**
- Add a "Retry" button to the connection lost banner
- Add manual reconnect handler that refreshes the SSE connection
- Add "Try again" button to send error banner (in addition to dismiss)

---

## Batch 3: Medium Priority (Accessibility & Polish)

### Task 9: Add Skip-to-Content Link

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Changes:**
- Add visually-hidden skip link as first child: `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to content</a>`
- Add `id="main-content"` to the `<main>` element

### Task 10: Add prefers-reduced-motion Support

**Files:**
- Modify: `src/app/globals.css`

**Changes:**
- Add `@media (prefers-reduced-motion: reduce)` block that sets `animation-duration: 0.01ms !important` and `transition-duration: 0.01ms !important`

### Task 11: Fix Footer Text Contrast

**Files:**
- Modify: `src/components/Footer.tsx`

**Changes:**
- Change `text-[#0A0A0A]/40` to `text-[#0A0A0A]/60` for better WCAG AA compliance

### Task 12: Fix Legal Jurisdiction

**Files:**
- Modify: `src/app/(legal)/terms/page.tsx:192-193`

**Changes:**
- Replace "the jurisdiction where Yoodle operates" with "the State of Colorado, United States"

### Task 13: Add aria-live to LoadingSpinner

**Files:**
- Modify: `src/components/ui/LoadingSpinner.tsx`

**Changes:**
- Wrap SVG in a div with `role="status" aria-live="polite"`
- Add `<span className="sr-only">Loading...</span>` inside

### Task 14: Make Agent Messages Visually Distinct in Chat

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx:79-84`

**Changes:**
- Already has `border-l-2 border-[#FFE600]` for agent — enhance with subtle yellow background tint
- Add small "AI" badge next to the robot emoji for extra clarity

### Task 15: Add Tooltip to Truncated Text

**Files:**
- Modify: `src/components/ai/cards/DiffPreviewCard.tsx`

**Changes:**
- Add `title={value}` attribute to truncated field values (line ~78)
- This gives native browser tooltip on hover showing full text

---

## Verification

After all tasks:
1. `npx vitest run` — all tests pass
2. `npx next build` — zero errors
3. Visual check: Landing page, auth flow, meeting room, AI chat, settings

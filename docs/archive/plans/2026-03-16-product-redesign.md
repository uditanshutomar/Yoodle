# Product Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the post-login Yoodle experience — consolidated 4-item nav, single-column dashboard, meetings with tabs, AI floating drawer, remove workspaces.

**Architecture:** Modify existing components in-place. New components: `AIDrawer` (floating panel), `MobileTabBar` (bottom nav). Ghost Rooms page merges into Meetings page as a tab. AI page replaced by drawer accessible everywhere. Workspaces deleted entirely.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Framer Motion, Radix UI, Lucide icons.

---

## Task 1: Remove Workspaces

**Files:**
- Delete: `src/app/(app)/workspaces/page.tsx`
- Delete: `src/app/(app)/workspaces/[workspaceId]/page.tsx`
- Modify: `src/components/layout/AppSidebar.tsx:24-31`

**Step 1: Delete workspace pages**

```bash
rm -rf src/app/\(app\)/workspaces
```

**Step 2: Remove Workspaces from sidebar nav**

In `src/components/layout/AppSidebar.tsx`, remove the `Terminal` import and the Workspaces nav item from the `navItems` array (line 29):

```typescript
// Before (lines 24-31):
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Ghost Rooms", href: "/ghost-rooms", icon: Ghost },
  { label: "Workspaces", href: "/workspaces", icon: Terminal },
  { label: "AI Assistant", href: "/ai", icon: Sparkles },
  { label: "Settings", href: "/settings", icon: Settings },
];

// After:
const navItems = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
];
```

Also remove unused imports: `Ghost`, `Terminal`, `Sparkles` from the lucide-react import (line 9-10).

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with zero errors (Ghost Rooms and AI pages still exist as routes but are no longer linked from nav).

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove workspaces, consolidate sidebar to 4 nav items"
```

---

## Task 2: Create AI Drawer Component

**Files:**
- Create: `src/components/ai/AIDrawer.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Step 1: Create AIDrawer component**

Create `src/components/ai/AIDrawer.tsx` — a right-side floating drawer that reuses the existing `ChatWindow` component. Key specs:
- 400px wide on desktop, full-screen on mobile
- Slides in from right with Framer Motion
- Triggered by exported state (Cmd+J shortcut + mascot FAB)
- Overlay on mobile, side panel on desktop
- Uses `useAIChat` hook for AI state

```tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot } from "lucide-react";
import ChatWindow from "@/components/ai/ChatWindow";
import { useAIChat } from "@/hooks/useAIChat";

// ── Context for global open/close ────────────────────────────────────────

interface AIDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const AIDrawerContext = createContext<AIDrawerContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export const useAIDrawer = () => useContext(AIDrawerContext);

export function AIDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((p) => !p), []);

  // Cmd+J / Ctrl+J shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <AIDrawerContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      <AIDrawerPanel isOpen={isOpen} onClose={close} />
      <AIDrawerFAB onClick={toggle} isOpen={isOpen} />
    </AIDrawerContext.Provider>
  );
}

// ── Floating Action Button (mascot) ──────────────────────────────────────

function AIDrawerFAB({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  if (isOpen) return null;

  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1, rotate: -5 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] lg:bottom-8 lg:right-8"
      title="Ask Doodle (⌘J)"
    >
      <Bot size={24} className="text-[#0A0A0A]" />
    </motion.button>
  );
}

// ── Drawer Panel ─────────────────────────────────────────────────────────

function AIDrawerPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } = useAIChat();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile overlay */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] lg:w-[400px] bg-[var(--background)] border-l-2 border-[var(--border)] shadow-[-4px_0_20px_rgba(0,0,0,0.1)] flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]">
                  <Bot size={16} className="text-[#0A0A0A]" />
                </div>
                <div>
                  <h3
                    className="text-sm font-bold text-[var(--text-primary)]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Doodle Poodle
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    ⌘J to toggle
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat — reuse existing ChatWindow */}
            <div className="flex-1 min-h-0">
              <ChatWindow
                messages={messages}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onStop={stopStreaming}
                onClear={clearMessages}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Integrate AIDrawerProvider into app layout**

Modify `src/app/(app)/layout.tsx`:

```tsx
"use client";

import AppSidebar from "@/components/layout/AppSidebar";
import AppTopbar from "@/components/layout/AppTopbar";
import { AIDrawerProvider } from "@/components/ai/AIDrawer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AIDrawerProvider>
      <div className="flex h-screen bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AIDrawerProvider>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. The AI drawer is now available app-wide via Cmd+J and FAB.

**Step 4: Commit**

```bash
git add src/components/ai/AIDrawer.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: add global AI drawer with Cmd+J shortcut and mascot FAB"
```

---

## Task 3: Create Mobile Bottom Tab Bar

**Files:**
- Create: `src/components/layout/MobileTabBar.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Step 1: Create MobileTabBar component**

Create `src/components/layout/MobileTabBar.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Video, MessageSquare, Settings } from "lucide-react";
import { useTotalUnread } from "@/hooks/useTotalUnread";

const tabs = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const { totalUnread } = useTotalUnread();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Hide on meeting/ghost-room active call pages
  if (pathname.match(/^\/meetings\/[^/]+$/) || pathname.match(/^\/ghost-rooms\/[^/]+$/)) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t-2 border-[var(--border)] bg-[var(--surface)] px-2 py-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            <div className="relative">
              <tab.icon size={20} />
              {tab.label === "Messages" && totalUnread > 0 && (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FFE600] px-1 text-[9px] font-black text-[#0A0A0A] border border-[#0A0A0A]">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold ${active ? "text-[var(--text-primary)]" : ""}`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tab.label}
            </span>
            {active && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-[#FFE600]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

**Step 2: Add MobileTabBar to app layout**

Modify `src/app/(app)/layout.tsx` — add `<MobileTabBar />` inside the AIDrawerProvider, after the main content div. Also add bottom padding on mobile so content isn't hidden behind the tab bar:

```tsx
import MobileTabBar from "@/components/layout/MobileTabBar";

// In the layout JSX, change the main element to include bottom padding on mobile:
<main className="flex-1 overflow-y-auto pb-16 lg:pb-0">

// Add MobileTabBar after the closing </div> of the flex container but inside AIDrawerProvider:
<MobileTabBar />
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/layout/MobileTabBar.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: add mobile bottom tab bar with 4 nav items"
```

---

## Task 4: Redesign Dashboard — Single-Column Flow

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx` (full rewrite of JSX)
- Modify: `src/app/(app)/dashboard/page.tsx`

This is the largest task. The dashboard changes from a 2-column layout to a single-column flow:
1. Action cards (Start Meeting + Join Meeting) side by side
2. AI Briefing card (tap to open AI drawer)
3. Up Next (today's meetings)
4. Recent Meetings
5. Calendar + Tasks side-by-side, collapsible

**Step 1: Rewrite Dashboard.tsx**

The key structural changes:

Remove imports: `TeamMap`, `DoodleStar`, `DoodleSquiggle`, `DoodleSparkles`, the entire `MascotChat` inline component (lines 327-464).

Remove from state: `showMascotChat`, `mascotMsg`, and the mascot-related effects.

Remove from JSX:
- Doodle decorations block (lines 111-116)
- TeamMap usage (line 238)
- Entire mascot section (lines 262-315) — replaced by the global AI drawer FAB

New JSX layout structure:

```tsx
<div className="dashboard-root">
  <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-0 py-6 lg:py-10 space-y-8">

    {/* Greeting + Mode toggle */}
    <div>
      <p className="text-sm text-[var(--text-muted)] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
        {greeting}{firstName ? `, ${firstName}` : ""} 👋
      </p>
      <h1
        className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight mb-4"
        style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
      >
        What are we working on?
      </h1>
      {/* Mode toggle — keep existing compact inline version */}
      {/* ... existing mode toggle code ... */}
    </div>

    {/* Action cards — Start Meeting + Join Meeting */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Start Meeting card */}
      <motion.a
        href="/meetings/new"
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-4 rounded-2xl bg-[#FFE600] border-2 border-[var(--border-strong)] px-6 py-5 shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
      >
        <svg ...video icon... />
        <div>
          <span className="text-base font-bold text-[#0A0A0A] block" style={{ fontFamily: "var(--font-heading)" }}>Start Meeting</span>
          <span className="text-xs text-[#0A0A0A]/60">Create an instant or scheduled room</span>
        </div>
      </motion.a>

      {/* Join Meeting card */}
      <div className="flex items-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
        <div className="flex-1 flex items-center gap-3 px-5 py-5">
          <svg ...lock icon... />
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Enter room code"
            className="bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] w-full"
          />
        </div>
        <button onClick={handleJoin} className="h-full bg-[var(--foreground)] px-6 py-5 text-sm font-bold text-[var(--background)] border-l-2 border-[var(--border-strong)]">
          Join
        </button>
      </div>
    </div>

    {/* AI Briefing card — opens AI drawer on click */}
    <motion.button
      onClick={() => aiDrawer.open()}
      whileHover={{ scale: 1.01 }}
      className="w-full text-left rounded-2xl border-2 border-[#FFE600] bg-[#FFE600]/5 px-5 py-4 transition-colors hover:bg-[#FFE600]/10"
    >
      <div className="flex items-center gap-3 mb-2">
        <Bot size={18} className="text-[#FFE600]" />
        <span className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
          AI Briefing
        </span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">Tap for details →</span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
        Ask Doodle Poodle to summarize your day, prep for meetings, or check what&apos;s pending.
      </p>
    </motion.button>

    {/* Meeting History (recent meetings) */}
    <MeetingHistory onSelectMeeting={(m) => setSelectedMeeting(m)} />

    {/* Calendar + Tasks side-by-side */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CalendarPanel />
      <TasksPanel
        pendingActions={pendingActions}
        onConfirmAction={confirmAction}
        onDenyAction={denyAction}
        onReviseAction={reviseAction}
      />
    </div>

  </div>

  {/* Meeting Detail Drawer — keep as-is */}
  <AnimatePresence>
    {selectedMeeting && (
      <MeetingDetail meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />
    )}
  </AnimatePresence>
</div>
```

**Step 2: Update dashboard page wrapper**

Modify `src/app/(app)/dashboard/page.tsx` — remove the negative margins since the new dashboard manages its own padding:

```tsx
"use client";
import Dashboard from "@/components/dashboard/Dashboard";
import "./dashboard.css";

export default function DashboardPage() {
  return (
    <div className="-mx-4 -my-6 lg:-mx-8">
      <Dashboard />
    </div>
  );
}
```

(Keep the negative margins — Dashboard now uses `max-w-4xl mx-auto` internally for proper centering.)

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: redesign dashboard to single-column flow with action cards"
```

---

## Task 5: Redesign Meetings Page — Three Tabs with Ghost Rooms

**Files:**
- Modify: `src/app/(app)/meetings/page.tsx` (major rewrite)

**Step 1: Add tabs and Ghost Rooms integration**

Rewrite `src/app/(app)/meetings/page.tsx` to include:
- Three tabs: Upcoming | Past | Ghost Rooms
- Single "New Meeting" button with dropdown (Instant / Schedule / Ghost Room)
- Ghost Rooms tab fetches from `/api/ghost-rooms` and renders ghost room cards inline
- Reuse existing `MeetingCard` component, add `GhostRoomCard` inline

Key additions to imports:
```tsx
import { Ghost, Clock, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
```

Tab state:
```tsx
const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "ghost">("upcoming");
```

Ghost rooms fetch (alongside existing meetings fetch):
```tsx
const [ghostRooms, setGhostRooms] = useState<GhostRoomSummary[]>([]);

useEffect(() => {
  fetch("/api/ghost-rooms", { credentials: "include" })
    .then((r) => r.json())
    .then((data) => {
      if (data.success && data.data) setGhostRooms(data.data);
    })
    .catch(() => {});
}, [retryCount]);
```

Tab bar UI:
```tsx
<div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1">
  {(["upcoming", "past", "ghost"] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
        activeTab === tab
          ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
      style={{ fontFamily: "var(--font-heading)" }}
    >
      {tab === "upcoming" ? "Upcoming" : tab === "past" ? "Past" : "Ghost Rooms"}
    </button>
  ))}
</div>
```

New Meeting dropdown (replaces the plain link button):
```tsx
<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <Button variant="primary" size="md" icon={Plus}>
      New Meeting <ChevronDown size={14} className="ml-1" />
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content sideOffset={8} align="end" className="z-50 min-w-[200px] bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-1.5">
      <DropdownMenu.Item asChild>
        <button onClick={handleInstantMeeting} className="...">
          <Video size={14} /> Instant Meeting
        </button>
      </DropdownMenu.Item>
      <DropdownMenu.Item asChild>
        <Link href="/meetings/new" className="...">
          <Calendar size={14} /> Schedule Meeting
        </Link>
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
      <DropdownMenu.Item asChild>
        <button onClick={handleCreateGhostRoom} className="...">
          <Ghost size={14} /> Ghost Room
        </button>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

The `handleInstantMeeting` function creates a meeting via POST `/api/meetings` and navigates to it. The `handleCreateGhostRoom` function creates via POST `/api/ghost-rooms` and navigates to `/ghost-rooms/:roomId`.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/\(app\)/meetings/page.tsx
git commit -m "feat: meetings page with Upcoming/Past/Ghost Rooms tabs and creation dropdown"
```

---

## Task 6: Remove Old Ghost Rooms and AI Pages

**Files:**
- Delete: `src/app/(app)/ghost-rooms/page.tsx`
- Delete: `src/app/(app)/ai/page.tsx`

Note: Keep `src/app/(app)/ghost-rooms/[roomId]/page.tsx` — that's the actual ghost room experience page. Only the listing page is being removed (its content is now in Meetings tab).

**Step 1: Delete the listing pages**

```bash
rm src/app/\(app\)/ghost-rooms/page.tsx
rm src/app/\(app\)/ai/page.tsx
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. The routes `/ghost-rooms` and `/ai` will now 404, which is correct since Ghost Rooms are under Meetings and AI is the drawer.

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove ghost-rooms listing and AI page (moved to meetings tab and drawer)"
```

---

## Task 7: Update AppTopbar — Remove Duplicate "New Meeting" Button

**Files:**
- Modify: `src/components/layout/AppTopbar.tsx`

The topbar currently has a "New Meeting" button that links to `/meetings/new`. Since the Meetings page now has a dropdown for meeting creation, we should keep the topbar button but make it a quick "Instant Meeting" action or remove it to declutter.

**Step 1: Remove the New Meeting button from topbar**

In `src/components/layout/AppTopbar.tsx`, remove lines 38-47 (the Button with `href="/meetings/new"`). Remove the `Plus` import from lucide-react and the `Button` import.

```tsx
// Remove these lines:
<Button
  variant="primary"
  size="sm"
  icon={Plus}
  href="/meetings/new"
  className="hidden sm:inline-flex"
>
  New Meeting
</Button>
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/layout/AppTopbar.tsx
git commit -m "refactor: remove duplicate New Meeting button from topbar"
```

---

## Task 8: ChatWindow Border Fix for AI Drawer

**Files:**
- Modify: `src/components/ai/ChatWindow.tsx:45`

The `ChatWindow` component has its own border/shadow styling that will double up inside the AI drawer. Make the outer styling conditional or remove it so it fits cleanly as a child.

**Step 1: Remove outer container styling from ChatWindow**

In `src/components/ai/ChatWindow.tsx` line 45, change:

```tsx
// Before:
<div className="flex flex-col h-full bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">

// After:
<div className="flex flex-col h-full bg-[var(--surface)] overflow-hidden">
```

This makes ChatWindow a clean child. The AI page had its own wrapping card; the drawer provides its own container. The border/shadow was cosmetic for the standalone page which is now deleted.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/ai/ChatWindow.tsx
git commit -m "fix: remove ChatWindow outer border for clean AI drawer integration"
```

---

## Task 9: Hide Mobile Hamburger (Sidebar) on Mobile — Use Tab Bar Instead

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`

The mobile hamburger menu is now redundant since we have a bottom tab bar. Keep the desktop sidebar but hide the hamburger button and mobile overlay on small screens.

**Step 1: Hide mobile hamburger and overlay**

In `src/components/layout/AppSidebar.tsx`:

Remove the mobile hamburger button (lines 140-146) and the mobile sidebar overlay AnimatePresence block (lines 153-184). Remove `Menu`, `X` from lucide imports. Remove `mobileOpen` state.

The entire component simplifies to just the desktop sidebar:

```tsx
export default function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { totalUnread } = useTotalUnread();

  // ... isActive, sidebarContent unchanged ...

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 h-screen bg-[var(--surface)] border-r-2 border-[var(--border)] sticky top-0"
      role="navigation"
      aria-label="Main navigation"
    >
      {sidebarContent}
    </aside>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "refactor: remove mobile hamburger menu — replaced by bottom tab bar"
```

---

## Task 10: Final Visual Polish and Build Verification

**Files:**
- Modify: `src/components/dashboard/TasksPanel.tsx` (remove nested scroll)
- Verify all pages render

**Step 1: Remove nested scroll from TasksPanel**

In `src/components/dashboard/TasksPanel.tsx`, find the task list container with `max-h-[240px] overflow-y-auto` and remove those classes (let content flow naturally in the page scroll).

**Step 2: Full build verification**

Run: `npm run build`
Expected: Build succeeds with zero errors.

**Step 3: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (the changes are UI-only, no API routes modified).

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: remove nested scroll from TasksPanel, final build verification"
```

---

## Verification Checklist

After all tasks:

1. `npm run build` — zero errors
2. Desktop (1280px+): 4-item sidebar, single-column dashboard, AI drawer via Cmd+J
3. Tablet (768px): Dashboard stacks properly, tab bar at bottom
4. Mobile (375px): Bottom tab bar, no hamburger, AI FAB in bottom-right, full-screen drawer
5. Meetings page: 3 tabs (Upcoming/Past/Ghost Rooms), dropdown for new meeting creation
6. `/workspaces` — 404
7. `/ai` — 404
8. `/ghost-rooms` — 404 (individual rooms `/ghost-rooms/:id` still work)
9. All existing tests pass

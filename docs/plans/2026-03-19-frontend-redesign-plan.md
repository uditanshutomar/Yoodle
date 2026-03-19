# Yoodle Workspace Frontend Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Yoodle from a meeting-focused app into a full workspace platform with customizable widget dashboard ("The Desk"), smart Kanban ("The Board"), hub-based navigation, and the Yoodler AI companion — all in Yoodle's neo-brutalist design language.

**Architecture:** Hub + contextual navigation with 5 top-level routes (The Desk, Rooms, The Board, Chatter, Pulse). Each hub is a self-contained page with internal tabs. The Desk uses `react-grid-layout` for a customizable widget grid. Yoodler (AI companion) is a global floating panel accessible from any page, replacing the current "Doodle Poodle" AI drawer. Existing components (KanbanBoard, ChatThread, CopilotPanel, MeetingDetail) are adapted and wrapped — not rewritten from scratch.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 4, Framer Motion, `react-grid-layout` (new dep), `@dnd-kit` (existing), Radix UI (existing), Lucide icons

**Design doc:** `docs/plans/2026-03-19-frontend-redesign-design.md`

**Branch:** `feat/frontend-redesign`

---

## Phase 1: Foundation — Navigation & Layout

### Task 1: Install `react-grid-layout` dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

```bash
npm install react-grid-layout @types/react-grid-layout
```

**Step 2: Verify installation**

```bash
node -e "require('react-grid-layout'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-grid-layout for customizable widget dashboard"
```

---

### Task 2: Redesign AppSidebar — 5-hub navigation

The sidebar currently has 4 items (Home, Meetings, Messages, Settings). Redesign to 5 branded hubs: The Desk, Rooms, The Board, Chatter, Pulse. Remove Settings from nav (moves to avatar menu). Remove user section from bottom (handled by topbar). Add Space switcher at top.

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`
- Modify: `src/hooks/useWorkspaces.ts` (already exists — provides workspace data)

**Step 1: Rewrite AppSidebar.tsx**

Replace the entire file. Key changes:
- Nav items: `The Desk` → `/dashboard`, `Rooms` → `/meetings`, `The Board` → `/board`, `Chatter` → `/messages`, `Pulse` → `/analytics`
- Icons: `Home` (grid icon), `DoorOpen` (rooms), `Kanban` (board), `MessageCircle` (chatter), `Activity` (pulse)
- Space switcher dropdown at top (uses `useWorkspaces` hook to list workspaces)
- Remove user section at bottom (avatar/logout move to topbar)
- Collapsible: on medium screens show icon-only, on mobile hide entirely (hamburger via topbar)
- Keep Yoodle logo + branding at top
- Keep the yellow active indicator dot and `layoutId` spring animation
- Add unread badge on Chatter (existing `useTotalUnread` hook)

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  DoorOpen,
  Kanban,
  MessageCircle,
  Activity,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
import { YoodleMascotSmall } from "../YoodleMascot";
import { useTotalUnread } from "@/hooks/useTotalUnread";
import { useWorkspaces, type Workspace } from "@/hooks/useWorkspaces";

const navItems = [
  { label: "The Desk", href: "/dashboard", icon: LayoutGrid },
  { label: "Rooms", href: "/meetings", icon: DoorOpen },
  { label: "The Board", href: "/board", icon: Kanban },
  { label: "Chatter", href: "/messages", icon: MessageCircle },
  { label: "Pulse", href: "/analytics", icon: Activity },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { totalUnread } = useTotalUnread();
  const { workspaces, fetchWorkspaces } = useWorkspaces();
  const [activeSpace, setActiveSpace] = useState<Workspace | null>(null);
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);

  useEffect(() => {
    fetchWorkspaces().catch(() => {});
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (workspaces.length > 0 && !activeSpace) {
      setActiveSpace(workspaces[0]);
    }
  }, [workspaces, activeSpace]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-64 xl:w-64 lg:shrink-0 h-screen bg-[var(--surface)] border-r-2 border-[var(--border)] sticky top-0"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b-2 border-[var(--border)]">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]">
            <YoodleMascotSmall className="h-8 w-8 mix-blend-multiply" />
          </span>
          <span
            className="text-2xl font-black tracking-tight text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
          >
            Yoodle
          </span>
        </div>

        {/* Space Switcher */}
        <div className="px-3 py-3 border-b border-[var(--border)]">
          <button
            onClick={() => setSpaceMenuOpen(!spaceMenuOpen)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors text-left"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFE600]/20 border border-[var(--border)] text-xs font-black" style={{ fontFamily: "var(--font-heading)" }}>
              {activeSpace?.name?.charAt(0)?.toUpperCase() || "Y"}
            </div>
            <span className="flex-1 text-sm font-bold text-[var(--text-primary)] truncate" style={{ fontFamily: "var(--font-heading)" }}>
              {activeSpace?.name || "My Space"}
            </span>
            <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${spaceMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {spaceMenuOpen && workspaces.length > 0 && (
            <div className="mt-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] p-1 space-y-0.5">
              {workspaces.map((ws) => (
                <button
                  key={ws._id}
                  onClick={() => { setActiveSpace(ws); setSpaceMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-[#FFE600]/20 text-[10px] font-black">
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>{ws.name}</span>
                  {ws._id === activeSpace?._id && <Check size={14} className="text-[#22C55E]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "bg-[#FFE600]/20 text-[var(--text-primary)] font-bold"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] font-medium"
                }`}
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <item.icon
                  size={18}
                  className={active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"}
                />
                {item.label}
                {item.label === "Chatter" && totalUnread > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFE600] px-1.5 text-[10px] font-black text-[#0A0A0A] border border-[var(--border-strong)] tabular-nums">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
                {active && !(item.label === "Chatter" && totalUnread > 0) && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FFE600]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```
Expected: Build succeeds (may have warnings for new routes that don't exist yet — that's fine).

**Step 3: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "feat: redesign sidebar with 5-hub navigation and Space switcher"
```

---

### Task 3: Redesign AppTopbar — Space-aware header with Pings

The topbar currently has search + notifications bell + user dropdown. Redesign to:
- Left: hamburger button (mobile only) + "Find anything" search bar
- Right: Pings bell (with count badge), user avatar dropdown (with Preferences link instead of Settings)
- Remove redundant logout/settings from sidebar — all in topbar dropdown now

**Files:**
- Modify: `src/components/layout/AppTopbar.tsx`

**Step 1: Rewrite AppTopbar.tsx**

Key changes:
- Search placeholder: "Find anything"
- Notifications icon label: "Pings"
- Dropdown links: Profile → `/settings#profile`, Preferences → `/settings`, Log out
- Add hamburger menu button for mobile (toggles sidebar drawer)
- Keep existing Radix dropdown, Framer Motion animation, neo-brutalist styling

```tsx
"use client";

import { useState } from "react";
import { Search, Bell, ChevronDown, LogOut, Settings, User, Menu, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Avatar from "../ui/Avatar";
import { useAuth } from "@/hooks/useAuth";

interface AppTopbarProps {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}

export default function AppTopbar({ onMenuToggle, menuOpen }: AppTopbarProps) {
  const { user, logout } = useAuth();
  const [searchValue, setSearchValue] = useState("");

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b-2 border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-xl px-4 lg:px-6">
      {/* Left: Mobile menu + Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <label htmlFor="topbar-search" className="sr-only">Find anything</label>
          <input
            id="topbar-search"
            type="search"
            placeholder="Find anything..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* Pings */}
        <button
          className="relative rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          aria-label="Pings"
          title="Pings"
        >
          <Bell size={18} />
        </button>

        {/* User dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 rounded-xl py-1 px-2 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer" aria-label="User menu">
              <Avatar src={user?.avatar} name={user?.name || "User"} size="sm" status="online" />
              <span className="hidden text-sm font-bold text-[var(--text-primary)] sm:block" style={{ fontFamily: "var(--font-heading)" }}>
                {user?.name || "User"}
              </span>
              <ChevronDown size={14} className="text-[var(--text-muted)]" />
            </button>
          </DropdownMenu.Trigger>
          <AnimatePresence>
            <DropdownMenu.Portal>
              <DropdownMenu.Content asChild sideOffset={8} align="end">
                <motion.div
                  className="z-50 min-w-[200px] bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-1.5"
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                    <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
                      {user?.email || ""}
                    </p>
                  </div>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings#profile"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <User size={14} />
                      Profile
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <Settings size={14} />
                      Preferences
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                  <DropdownMenu.Item
                    onSelect={logout}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer outline-none"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    <LogOut size={14} />
                    Log out
                  </DropdownMenu.Item>
                </motion.div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </AnimatePresence>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/components/layout/AppTopbar.tsx
git commit -m "feat: redesign topbar with Find anything search, Pings, and mobile hamburger"
```

---

### Task 4: Redesign MobileTabBar — 5 branded hubs

**Files:**
- Modify: `src/components/layout/MobileTabBar.tsx`

**Step 1: Update MobileTabBar with new nav items**

Replace nav items to match the 5 hubs. Same icons as sidebar. Keep existing patterns (active indicator, unread badge, hide on meeting/ghost room pages).

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, DoorOpen, Kanban, MessageCircle, Activity } from "lucide-react";
import { useTotalUnread } from "@/hooks/useTotalUnread";

const tabs = [
  { label: "Desk", href: "/dashboard", icon: LayoutGrid },
  { label: "Rooms", href: "/meetings", icon: DoorOpen },
  { label: "Board", href: "/board", icon: Kanban },
  { label: "Chatter", href: "/messages", icon: MessageCircle },
  { label: "Pulse", href: "/analytics", icon: Activity },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const { totalUnread } = useTotalUnread();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Hide on active meeting/ghost-room call pages
  if (pathname.match(/^\/meetings\/[^/]+\/room/) || pathname.match(/^\/ghost-rooms\/[^/]+$/)) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t-2 border-[var(--border)] bg-[var(--surface)] px-1 py-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
              active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
            }`}
          >
            {active && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-[#FFE600]" />
            )}
            <div className="relative">
              <tab.icon size={18} />
              {tab.label === "Chatter" && totalUnread > 0 && (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FFE600] px-1 text-[9px] font-black text-[#0A0A0A] border border-[var(--border-strong)]">
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
          </Link>
        );
      })}
    </nav>
  );
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/components/layout/MobileTabBar.tsx
git commit -m "feat: update mobile tab bar with 5 branded hub items"
```

---

### Task 5: Update App Layout — Wire mobile sidebar drawer + Yoodler provider

The app layout currently wraps everything in `AIDrawerProvider`. We need to:
- Rename `AIDrawerProvider` → keep using it but it will be refactored to `YoodlerProvider` in a later task
- Add mobile sidebar drawer state (hamburger toggle)
- Pass `onMenuToggle` and `menuOpen` to AppTopbar
- Add mobile sidebar overlay

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Step 1: Update layout with mobile drawer**

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppSidebar from "@/components/layout/AppSidebar";
import AppTopbar from "@/components/layout/AppTopbar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { AIDrawerProvider } from "@/components/ai/AIDrawer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <AIDrawerProvider>
      <div className="flex h-screen bg-background">
        {/* Desktop Sidebar */}
        <AppSidebar />

        {/* Mobile Sidebar Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.div
                className="fixed top-0 left-0 z-50 h-full w-64 bg-[var(--surface)] border-r-2 border-[var(--border)] lg:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <AppSidebar />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppTopbar
            onMenuToggle={() => setMobileMenuOpen((p) => !p)}
            menuOpen={mobileMenuOpen}
          />
          <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
            <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileTabBar />
    </AIDrawerProvider>
  );
}
```

**Note:** The mobile sidebar drawer renders `<AppSidebar />` inside a motion div. AppSidebar's own `aside` wrapper with `hidden lg:flex` will need to be adjusted — the component should export the content separately, or we make the outer `aside` accept a `className` prop to override visibility. The simplest approach: modify AppSidebar to accept an optional `mobile` prop that removes the `hidden lg:flex` wrapper.

**Step 2: Update AppSidebar to support mobile mode**

Add to `AppSidebar.tsx`: Accept a `mobile?: boolean` prop. When `mobile` is true, render without the `hidden lg:flex` wrapper — just the inner `<div className="flex h-full flex-col">...</div>`.

```tsx
// At the top of AppSidebar:
interface AppSidebarProps {
  mobile?: boolean;
}

export default function AppSidebar({ mobile }: AppSidebarProps) {
  // ... existing code ...

  if (mobile) {
    return <div className="flex h-full flex-col">{/* same inner content */}</div>;
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 xl:w-64 lg:shrink-0 h-screen bg-[var(--surface)] border-r-2 border-[var(--border)] sticky top-0" role="navigation" aria-label="Main navigation">
      {/* same inner content */}
    </aside>
  );
}
```

Then in `layout.tsx`, the mobile drawer renders `<AppSidebar mobile />`.

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/components/layout/AppSidebar.tsx
git commit -m "feat: add mobile sidebar drawer and wire topbar hamburger toggle"
```

---

### Task 6: Create route stubs for new hubs

Create placeholder pages for `/board` and `/analytics` routes so navigation doesn't 404.

**Files:**
- Create: `src/app/(app)/board/page.tsx`
- Create: `src/app/(app)/analytics/page.tsx`

**Step 1: Create board page stub**

```tsx
// src/app/(app)/board/page.tsx
"use client";

import { motion } from "framer-motion";
import { Kanban } from "lucide-react";

export default function BoardPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE600]/20 border-2 border-[var(--border-strong)] mb-4">
        <Kanban size={28} className="text-[var(--text-primary)]" />
      </div>
      <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
        The Board
      </h1>
      <p className="text-sm text-[var(--text-secondary)]">Smart Kanban coming soon</p>
    </motion.div>
  );
}
```

**Step 2: Create analytics page stub**

```tsx
// src/app/(app)/analytics/page.tsx
"use client";

import { motion } from "framer-motion";
import { Activity } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#A855F7]/20 border-2 border-[var(--border-strong)] mb-4">
        <Activity size={28} className="text-[#A855F7]" />
      </div>
      <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
        Pulse
      </h1>
      <p className="text-sm text-[var(--text-secondary)]">Workspace analytics coming soon</p>
    </motion.div>
  );
}
```

**Step 3: Verify build + navigation**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/app/\(app\)/board/page.tsx src/app/\(app\)/analytics/page.tsx
git commit -m "feat: add route stubs for The Board and Pulse hubs"
```

---

## Phase 2: The Desk — Customizable Widget Dashboard

### Task 7: Create widget infrastructure

Build the widget system: widget registry, widget wrapper component, and desk layout state management.

**Files:**
- Create: `src/components/desk/widget-registry.ts` — Widget metadata registry
- Create: `src/components/desk/WidgetWrapper.tsx` — Common widget chrome
- Create: `src/hooks/useDeskLayout.ts` — Layout persistence hook

**Step 1: Create widget registry**

```tsx
// src/components/desk/widget-registry.ts
import { type LucideIcon, Calendar, Rocket, StickyNote, Sparkles, Activity, MessageCircle, Play, Rss } from "lucide-react";

export interface WidgetMeta {
  id: string;
  title: string;
  icon: LucideIcon;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  description: string;
}

export const WIDGET_REGISTRY: Record<string, WidgetMeta> = {
  "up-next": {
    id: "up-next",
    title: "Up Next",
    icon: Calendar,
    minW: 4, minH: 2, defaultW: 8, defaultH: 3,
    description: "Upcoming meetings with quick-join",
  },
  "launchpad": {
    id: "launchpad",
    title: "Launchpad",
    icon: Rocket,
    minW: 3, minH: 2, defaultW: 4, defaultH: 2,
    description: "Quick actions — create room, join room, new sticky",
  },
  "sticky-board": {
    id: "sticky-board",
    title: "Sticky Board",
    icon: StickyNote,
    minW: 3, minH: 2, defaultW: 4, defaultH: 3,
    description: "Compact view of your Board tasks",
  },
  "yoodler-says": {
    id: "yoodler-says",
    title: "Yoodler Says",
    icon: Sparkles,
    minW: 3, minH: 2, defaultW: 4, defaultH: 2,
    description: "AI suggestions and nudges",
  },
  "pulse-check": {
    id: "pulse-check",
    title: "Pulse Check",
    icon: Activity,
    minW: 3, minH: 2, defaultW: 6, defaultH: 2,
    description: "Mini meeting trends chart",
  },
  "buzz": {
    id: "buzz",
    title: "Buzz",
    icon: MessageCircle,
    minW: 3, minH: 2, defaultW: 6, defaultH: 2,
    description: "Unread messages and recent threads",
  },
  "replays": {
    id: "replays",
    title: "Replays",
    icon: Play,
    minW: 3, minH: 2, defaultW: 4, defaultH: 2,
    description: "Past meetings with Vibe Check scores",
  },
  "the-feed": {
    id: "the-feed",
    title: "The Feed",
    icon: Rss,
    minW: 3, minH: 2, defaultW: 4, defaultH: 2,
    description: "Recent workspace activity",
  },
};

export const DEFAULT_LAYOUT = [
  { i: "up-next", x: 0, y: 0, w: 8, h: 3 },
  { i: "launchpad", x: 8, y: 0, w: 4, h: 2 },
  { i: "yoodler-says", x: 0, y: 3, w: 4, h: 2 },
  { i: "sticky-board", x: 4, y: 3, w: 4, h: 3 },
  { i: "pulse-check", x: 8, y: 2, w: 4, h: 2 },
  { i: "buzz", x: 0, y: 5, w: 6, h: 2 },
  { i: "replays", x: 6, y: 5, w: 6, h: 2 },
];

export const ALL_WIDGET_IDS = Object.keys(WIDGET_REGISTRY);
```

**Step 2: Create WidgetWrapper**

```tsx
// src/components/desk/WidgetWrapper.tsx
"use client";

import { type ReactNode } from "react";
import { type WidgetMeta } from "./widget-registry";

interface WidgetWrapperProps {
  meta: WidgetMeta;
  children: ReactNode;
  editMode?: boolean;
  onRemove?: () => void;
}

export default function WidgetWrapper({ meta, children, editMode, onRemove }: WidgetWrapperProps) {
  const Icon = meta.icon;

  return (
    <div className="h-full rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden flex flex-col">
      {/* Widget header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[var(--border-strong)]">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-[#A855F7]" />
          <span className="font-bold text-sm text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            {meta.title}
          </span>
        </div>
        {editMode && onRemove && (
          <button
            onClick={onRemove}
            className="text-[var(--text-muted)] hover:text-[#FF6B6B] transition-colors text-xs font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Remove
          </button>
        )}
      </div>
      {/* Widget content */}
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}
```

**Step 3: Create useDeskLayout hook**

```tsx
// src/hooks/useDeskLayout.ts
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_LAYOUT } from "@/components/desk/widget-registry";

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const STORAGE_KEY = "yoodle-desk-layout";

export function useDeskLayout() {
  const [layout, setLayout] = useState<LayoutItem[]>(() => {
    if (typeof window === "undefined") return DEFAULT_LAYOUT;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_LAYOUT;
    } catch {
      return DEFAULT_LAYOUT;
    }
  });

  const [editMode, setEditMode] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const updateLayout = useCallback((newLayout: LayoutItem[]) => {
    setLayout(newLayout);
    // Debounced persist to localStorage
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
      } catch { /* quota exceeded — ignore */ }
    }, 500);
  }, []);

  const addWidget = useCallback((widgetId: string) => {
    setLayout((prev) => {
      if (prev.some((item) => item.i === widgetId)) return prev;
      // Place at bottom
      const maxY = prev.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      return [...prev, { i: widgetId, x: 0, y: maxY, w: 4, h: 2 }];
    });
  }, []);

  const removeWidget = useCallback((widgetId: string) => {
    setLayout((prev) => prev.filter((item) => item.i !== widgetId));
  }, []);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Persist to server (best-effort) when layout changes and user is done editing
  const persistToServer = useCallback(async () => {
    try {
      await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferences: { deskLayout: layout } }),
      });
    } catch {
      // Silent fail — localStorage is the primary store
    }
  }, [layout]);

  // Save to server when exiting edit mode
  useEffect(() => {
    if (!editMode) return;
    return () => { persistToServer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  return {
    layout,
    editMode,
    setEditMode,
    updateLayout,
    addWidget,
    removeWidget,
    resetLayout,
  };
}
```

**Step 4: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 5: Commit**

```bash
git add src/components/desk/ src/hooks/useDeskLayout.ts
git commit -m "feat: create widget infrastructure — registry, wrapper, and layout hook"
```

---

### Task 8: Create individual widget components

Build all 8 widgets. Each is a self-contained component that fetches its own data.

**Files:**
- Create: `src/components/desk/widgets/UpNextWidget.tsx`
- Create: `src/components/desk/widgets/LaunchpadWidget.tsx`
- Create: `src/components/desk/widgets/StickyBoardWidget.tsx`
- Create: `src/components/desk/widgets/YoodlerSaysWidget.tsx`
- Create: `src/components/desk/widgets/PulseCheckWidget.tsx`
- Create: `src/components/desk/widgets/BuzzWidget.tsx`
- Create: `src/components/desk/widgets/ReplaysWidget.tsx`
- Create: `src/components/desk/widgets/TheFeedWidget.tsx`
- Create: `src/components/desk/widgets/index.ts` — Widget component map

**Step 1: Create UpNextWidget**

```tsx
// src/components/desk/widgets/UpNextWidget.tsx
"use client";

import { useEffect, useState } from "react";
import { Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Meeting {
  _id: string;
  title: string;
  scheduledTime?: string;
  participants?: { userId: string; name?: string }[];
}

export default function UpNextWidget() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch("/api/meetings?status=upcoming&limit=5", {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setMeetings(json.data?.meetings || json.meetings || []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-[var(--surface-hover)] animate-pulse" />)}</div>;
  }

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-4">
        <Clock size={24} className="text-[var(--text-muted)] mb-2" />
        <p className="text-sm text-[var(--text-secondary)]">No upcoming meetings</p>
        <Link href="/meetings/new" className="text-xs font-bold text-[#FFE600] mt-2 hover:underline" style={{ fontFamily: "var(--font-heading)" }}>
          Start a Room →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {meetings.map((m) => (
        <Link
          key={m._id}
          href={`/meetings/${m._id}`}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] hover:border-[#FFE600] hover:bg-[#FFE600]/5 transition-all group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)] truncate" style={{ fontFamily: "var(--font-heading)" }}>
              {m.title || "Untitled Room"}
            </p>
            {m.scheduledTime && (
              <p className="text-xs text-[var(--text-muted)]">
                {new Date(m.scheduledTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <ArrowRight size={14} className="text-[var(--text-muted)] group-hover:text-[#FFE600] transition-colors" />
        </Link>
      ))}
    </div>
  );
}
```

**Step 2: Create LaunchpadWidget**

```tsx
// src/components/desk/widgets/LaunchpadWidget.tsx
"use client";

import { useState } from "react";
import { Video, LogIn, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function LaunchpadWidget() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleJoin = () => {
    const code = joinCode.trim();
    if (!code) return;
    router.push(`/meetings/join?code=${encodeURIComponent(code)}`);
  };

  return (
    <div className="space-y-2 h-full flex flex-col">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => router.push("/meetings/new")}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl bg-[#FFE600] border-2 border-[var(--border-strong)] shadow-[2px_2px_0_var(--border-strong)] text-sm font-bold text-[#0A0A0A] hover:shadow-[1px_1px_0_var(--border-strong)] transition-all"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <Video size={16} /> Start a Room
      </motion.button>

      <div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border)] overflow-hidden">
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Room code"
          className="flex-1 px-3 py-2 text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          style={{ fontFamily: "var(--font-body)" }}
        />
        <button
          onClick={handleJoin}
          className="px-3 py-2 text-sm font-bold bg-[var(--foreground)] text-[var(--background)] border-l-2 border-[var(--border)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Join
        </button>
      </div>

      <button
        onClick={() => router.push("/board")}
        className="flex items-center gap-2 w-full px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <StickyNote size={14} /> New Sticky
      </button>
    </div>
  );
}
```

**Step 3: Create remaining widget stubs**

For `StickyBoardWidget`, `YoodlerSaysWidget`, `PulseCheckWidget`, `BuzzWidget`, `ReplaysWidget`, `TheFeedWidget` — create simple components that fetch their respective data from existing API endpoints. Each follows the same pattern:

- Mount → fetch data with AbortController
- Show skeleton while loading
- Show empty state if no data
- Show data in Yoodle-styled cards

Each widget should be roughly 60-100 lines. The data sources:
- `StickyBoardWidget` → `GET /api/boards/:id/tasks` (use first board)
- `YoodlerSaysWidget` → Static suggestions for now (will connect to AI later)
- `PulseCheckWidget` → `GET /api/meetings/analytics/trends`
- `BuzzWidget` → `GET /api/messages/conversations` (via `useConversations`)
- `ReplaysWidget` → `GET /api/meetings?status=completed&limit=3`
- `TheFeedWidget` → `GET /api/workspaces/:id/audit`

**Step 4: Create widget index**

```tsx
// src/components/desk/widgets/index.ts
import dynamic from "next/dynamic";
import { type ComponentType } from "react";

const UpNextWidget = dynamic(() => import("./UpNextWidget"), { ssr: false });
const LaunchpadWidget = dynamic(() => import("./LaunchpadWidget"), { ssr: false });
const StickyBoardWidget = dynamic(() => import("./StickyBoardWidget"), { ssr: false });
const YoodlerSaysWidget = dynamic(() => import("./YoodlerSaysWidget"), { ssr: false });
const PulseCheckWidget = dynamic(() => import("./PulseCheckWidget"), { ssr: false });
const BuzzWidget = dynamic(() => import("./BuzzWidget"), { ssr: false });
const ReplaysWidget = dynamic(() => import("./ReplaysWidget"), { ssr: false });
const TheFeedWidget = dynamic(() => import("./TheFeedWidget"), { ssr: false });

export const WIDGET_COMPONENTS: Record<string, ComponentType> = {
  "up-next": UpNextWidget,
  "launchpad": LaunchpadWidget,
  "sticky-board": StickyBoardWidget,
  "yoodler-says": YoodlerSaysWidget,
  "pulse-check": PulseCheckWidget,
  "buzz": BuzzWidget,
  "replays": ReplaysWidget,
  "the-feed": TheFeedWidget,
};
```

**Step 5: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 6: Commit**

```bash
git add src/components/desk/widgets/
git commit -m "feat: create all 8 desk widgets — Up Next, Launchpad, Sticky Board, Yoodler Says, Pulse Check, Buzz, Replays, The Feed"
```

---

### Task 9: Build The Desk page with react-grid-layout

Create the main Desk page component that renders the widget grid with drag/drop/resize.

**Files:**
- Create: `src/components/desk/DeskPage.tsx`
- Create: `src/components/desk/WidgetCatalog.tsx` — "Add Widget" drawer
- Modify: `src/app/(app)/dashboard/page.tsx` — Render DeskPage instead of Dashboard

**Step 1: Create DeskPage**

```tsx
// src/components/desk/DeskPage.tsx
"use client";

import { useMemo } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import { motion } from "framer-motion";
import { Settings2, RotateCcw } from "lucide-react";
import WidgetWrapper from "./WidgetWrapper";
import WidgetCatalog from "./WidgetCatalog";
import { WIDGET_REGISTRY } from "./widget-registry";
import { WIDGET_COMPONENTS } from "./widgets";
import { useDeskLayout } from "@/hooks/useDeskLayout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function DeskPage() {
  const {
    layout,
    editMode,
    setEditMode,
    updateLayout,
    addWidget,
    removeWidget,
    resetLayout,
  } = useDeskLayout();

  const activeWidgetIds = useMemo(() => layout.map((l) => l.i), [layout]);

  const breakpointLayouts = useMemo(() => ({
    lg: layout,
    md: layout.map((l) => ({ ...l, w: Math.min(l.w, 6) })),
    sm: layout.map((l, idx) => ({ ...l, x: 0, w: 6, y: idx * 2 })),
    xs: layout.map((l, idx) => ({ ...l, x: 0, w: 4, y: idx * 2 })),
  }), [layout]);

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 px-4 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
          >
            The Desk
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Your workspace at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={resetLayout}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border-2 border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border-2 transition-all ${
              editMode
                ? "border-[#FFE600] bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <Settings2 size={12} />
            {editMode ? "Done" : "Make it yours"}
          </motion.button>
        </div>
      </div>

      {/* Widget Grid */}
      <ResponsiveGridLayout
        layouts={breakpointLayouts}
        breakpoints={{ lg: 1024, md: 768, sm: 640, xs: 0 }}
        cols={{ lg: 12, md: 6, sm: 6, xs: 4 }}
        rowHeight={80}
        isDraggable={editMode}
        isResizable={editMode}
        onLayoutChange={(newLayout) => {
          if (editMode) updateLayout(newLayout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
        }}
        draggableHandle=".widget-drag-handle"
        containerPadding={[0, 0]}
        margin={[16, 16]}
      >
        {layout.map((item) => {
          const meta = WIDGET_REGISTRY[item.i];
          const WidgetComponent = WIDGET_COMPONENTS[item.i];
          if (!meta || !WidgetComponent) return null;

          return (
            <div key={item.i}>
              <WidgetWrapper
                meta={meta}
                editMode={editMode}
                onRemove={() => removeWidget(item.i)}
              >
                {editMode && <div className="widget-drag-handle absolute top-0 left-0 right-0 h-10 cursor-grab active:cursor-grabbing" />}
                <WidgetComponent />
              </WidgetWrapper>
            </div>
          );
        })}
      </ResponsiveGridLayout>

      {/* Widget Catalog (edit mode) */}
      {editMode && (
        <WidgetCatalog
          activeWidgetIds={activeWidgetIds}
          onAdd={addWidget}
        />
      )}
    </div>
  );
}
```

**Step 2: Create WidgetCatalog**

```tsx
// src/components/desk/WidgetCatalog.tsx
"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { WIDGET_REGISTRY, ALL_WIDGET_IDS } from "./widget-registry";

interface WidgetCatalogProps {
  activeWidgetIds: string[];
  onAdd: (widgetId: string) => void;
}

export default function WidgetCatalog({ activeWidgetIds, onAdd }: WidgetCatalogProps) {
  const available = ALL_WIDGET_IDS.filter((id) => !activeWidgetIds.includes(id));

  if (available.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 rounded-2xl border-2 border-dashed border-[var(--border)] p-6"
    >
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
        Add Widgets
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {available.map((id) => {
          const meta = WIDGET_REGISTRY[id];
          const Icon = meta.icon;
          return (
            <button
              key={id}
              onClick={() => onAdd(id)}
              className="flex items-center gap-3 p-3 rounded-xl border-2 border-[var(--border)] hover:border-[#FFE600] hover:bg-[#FFE600]/5 transition-all text-left"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-hover)] flex-shrink-0">
                <Icon size={16} className="text-[var(--text-secondary)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate" style={{ fontFamily: "var(--font-heading)" }}>{meta.title}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">{meta.description}</p>
              </div>
              <Plus size={14} className="text-[var(--text-muted)] flex-shrink-0 ml-auto" />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
```

**Step 3: Update dashboard page to render DeskPage**

```tsx
// src/app/(app)/dashboard/page.tsx
"use client";

import dynamic from "next/dynamic";

const DeskPage = dynamic(() => import("@/components/desk/DeskPage"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 p-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-2xl bg-[var(--surface-hover)] animate-pulse" />
      ))}
    </div>
  ),
});

export default function DashboardPage() {
  return <DeskPage />;
}
```

**Step 4: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 5: Commit**

```bash
git add src/components/desk/ src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: build The Desk — customizable widget dashboard with react-grid-layout"
```

---

## Phase 3: Yoodler — AI Companion

### Task 10: Rename AI Drawer to Yoodler

Rebrand the existing AI Drawer (Doodle Poodle) to Yoodler. Update FAB text, drawer title, and keyboard shortcut tooltip.

**Files:**
- Modify: `src/components/ai/AIDrawer.tsx` — Update branding strings
- Modify: `src/components/ai/constants.ts` — Update mascot references if needed

**Step 1: Update AIDrawer branding**

In `AIDrawer.tsx`, find and replace:
- `"Doodle Poodle"` → `"Yoodler"`
- `"Your AI meeting buddy"` → `"Your AI workspace companion"`
- `"Ask Doodle (⌘J)"` → `"Ask Yoodler (⌘J)"`
- `"AI Assistant"` aria-label → `"Yoodler — AI Companion"`
- `"Open AI assistant"` → `"Open Yoodler"`

Keep the entire component structure, FAB behavior (draggable), keyboard shortcut (⌘J), insight count badge, and mascot image rendering unchanged.

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/components/ai/AIDrawer.tsx
git commit -m "feat: rebrand Doodle Poodle to Yoodler AI companion"
```

---

## Phase 4: Rooms Hub

### Task 11: Redesign meetings page as Rooms hub

The current meetings page lists meetings. Redesign with internal tabs: Upcoming | Past | Blueprints. Add branded naming.

**Files:**
- Modify: `src/app/(app)/meetings/page.tsx`

**Step 1: Read current meetings page**

Read `src/app/(app)/meetings/page.tsx` to understand current structure.

**Step 2: Redesign with tabs**

Add a tab bar at the top with "Upcoming", "Past", and "Blueprints" tabs. Filter meeting list by tab. Add "Start a Room" and "Join a Room" buttons at top. Keep existing meeting card rendering but add Vibe Check badge where analytics data exists.

Use the branded heading: "Rooms" with Yoodle text shadow.

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/app/\(app\)/meetings/page.tsx
git commit -m "feat: redesign meetings page as Rooms hub with Upcoming/Past/Blueprints tabs"
```

---

## Phase 5: The Board Hub

### Task 12: Create The Board page wrapping existing KanbanBoard

The project already has `KanbanBoard.tsx` (537 lines), `KanbanColumn.tsx`, `KanbanCard.tsx`, and `TaskDetail.tsx`. The Board hub wraps these with Yoodle branding, view toggle (Board/List), and filter controls.

**Files:**
- Modify: `src/app/(app)/board/page.tsx` — Replace stub with full page
- Create: `src/components/board/BoardPage.tsx` — Hub wrapper with view toggle and filters

**Step 1: Create BoardPage wrapper**

```tsx
// src/components/board/BoardPage.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Kanban, List, Filter, Plus, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useBoard } from "@/hooks/useBoard";
import { useAuth } from "@/hooks/useAuth";

const KanbanBoard = dynamic(() => import("./KanbanBoard"), { ssr: false });

export default function BoardPage() {
  const { user } = useAuth();
  const boardId = user?.defaultBoardId; // Need to resolve board ID
  const { board, tasks, loading, error, createTask, updateTask, deleteTask, reorderTasks, setTasks, refetch } = useBoard(boardId);
  const [view, setView] = useState<"board" | "list">("board");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
          >
            The Board
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Stickies, lanes, and auto-stickies from your meetings</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-xl border-2 border-[var(--border)] overflow-hidden">
            <button
              onClick={() => setView("board")}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-bold transition-colors ${
                view === "board" ? "bg-[#FFE600] text-[#0A0A0A]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              }`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <Kanban size={12} /> Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-bold border-l-2 border-[var(--border)] transition-colors ${
                view === "list" ? "bg-[#FFE600] text-[#0A0A0A]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              }`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <List size={12} /> List
            </button>
          </div>
        </div>
      </div>

      {/* Board Content */}
      {loading ? (
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 h-96 rounded-2xl bg-[var(--surface-hover)] animate-pulse border-2 border-[var(--border)]" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-sm text-[#FF6B6B] mb-2">{error}</p>
          <button onClick={refetch} className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Retry
          </button>
        </div>
      ) : !board ? (
        <div className="text-center py-20">
          <Kanban size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)] mb-4">No board found for this Space</p>
          <p className="text-xs text-[var(--text-muted)]">Boards are created automatically when you start using Yoodle</p>
        </div>
      ) : (
        <KanbanBoard
          board={board}
          tasks={tasks}
          onCreateTask={createTask}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onReorderTasks={reorderTasks}
          setTasks={setTasks}
        />
      )}
    </div>
  );
}
```

**Step 2: Update board page route**

```tsx
// src/app/(app)/board/page.tsx
"use client";

import dynamic from "next/dynamic";

const BoardPage = dynamic(() => import("@/components/board/BoardPage"), {
  ssr: false,
  loading: () => (
    <div className="flex gap-4 p-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex-1 h-96 rounded-2xl bg-[var(--surface-hover)] animate-pulse" />
      ))}
    </div>
  ),
});

export default function BoardRoute() {
  return <BoardPage />;
}
```

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/components/board/BoardPage.tsx src/app/\(app\)/board/page.tsx
git commit -m "feat: build The Board hub wrapping existing KanbanBoard with view toggle"
```

---

## Phase 6: Pulse Hub — Analytics

### Task 13: Build Pulse analytics page

Create the Pulse hub with sections: Trends, Vibe Checks, Heads Ups, Space Summary.

**Files:**
- Modify: `src/app/(app)/analytics/page.tsx` — Replace stub with full page
- Create: `src/components/pulse/PulsePage.tsx` — Main Pulse component
- Create: `src/components/pulse/TrendsSection.tsx` — Trends charts
- Create: `src/components/pulse/HeadsUpSection.tsx` — AI pattern alerts

**Step 1: Create PulsePage**

The PulsePage fetches from `/api/meetings/analytics/trends` and `/api/admin/summary` and renders sections. Reuse the existing `MeetingTrendsCard` data-fetching pattern but with full-width layout.

Each section is a Card with Yoodle styling:
- **Trends** — Grid of 4 stat cards (meetings count, avg Vibe Check, decisions, actions) + patterns
- **Heads Ups** — Pattern alerts from trends API, styled as alert cards with severity colors
- **Space Summary** — Workspace-level metrics (if admin endpoint available)

**Step 2: Update analytics route**

```tsx
// src/app/(app)/analytics/page.tsx
"use client";

import dynamic from "next/dynamic";

const PulsePage = dynamic(() => import("@/components/pulse/PulsePage"), { ssr: false });

export default function AnalyticsRoute() {
  return <PulsePage />;
}
```

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/components/pulse/ src/app/\(app\)/analytics/page.tsx
git commit -m "feat: build Pulse analytics hub with Trends, Vibe Checks, and Heads Up sections"
```

---

## Phase 7: Meeting Room — Focused Minimalism + Yoodler Live

### Task 14: Update meeting room to use Yoodler Live branding

The meeting room page (`src/app/(app)/meetings/[meetingId]/room/page.tsx`, 1077 lines) is already focused. We just need to:
- Rename "Copilot" panel to "Yoodler Live"
- Update the CopilotPanel header text and icon
- Remove any workspace navigation chrome that bleeds into the room

**Files:**
- Modify: `src/components/meeting/CopilotPanel.tsx` — Rename to Yoodler Live

**Step 1: Update CopilotPanel branding**

In `CopilotPanel.tsx`:
- Change header text from `"Copilot"` to `"Yoodler Live"`
- Keep `Sparkles` icon but ensure it uses `#A855F7` (Yoodler purple)
- Keep all SSE logic, error handling, retry button unchanged

**Step 2: Update room page references**

In the room page, find the button that toggles the copilot panel and update its tooltip/label from "Copilot" to "Yoodler Live".

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/components/meeting/CopilotPanel.tsx src/app/\(app\)/meetings/\[meetingId\]/room/page.tsx
git commit -m "feat: rebrand CopilotPanel to Yoodler Live in meeting room"
```

---

## Phase 8: Final Integration & Polish

### Task 15: Clean up old Dashboard component references

The old `Dashboard.tsx` and its dashboard CSS are no longer used. Clean up:
- Remove `src/app/(app)/dashboard/dashboard.css` if it exists
- Keep `src/components/dashboard/Dashboard.tsx` and sub-components for now (widgets may reference them) but they're no longer the entry point

**Files:**
- Remove: `src/app/(app)/dashboard/dashboard.css` (if exists)
- Verify no other pages import `Dashboard` directly

**Step 1: Check for dashboard.css usage**

```bash
grep -r "dashboard.css" src/ --include="*.tsx" --include="*.ts"
```

**Step 2: Remove unused import/file**

If `dashboard.css` is only imported by the old dashboard page, remove the import and file.

**Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up old dashboard references and unused CSS"
```

---

### Task 16: Full build verification and smoke test

**Step 1: Full build**

```bash
npm run build
```
Expected: Zero errors.

**Step 2: Check all routes compile**

Verify these routes exist in the build output:
- `/dashboard` — The Desk
- `/meetings` — Rooms
- `/board` — The Board
- `/messages` — Chatter
- `/analytics` — Pulse
- `/settings` — Preferences
- `/meetings/[meetingId]/room` — The Room

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build issues from frontend redesign"
```

---

## Summary

| Phase | Tasks | What it builds |
|-------|-------|---------------|
| 1: Foundation | Tasks 1-6 | New 5-hub navigation, mobile drawer, route stubs |
| 2: The Desk | Tasks 7-9 | Customizable widget dashboard with 8 widgets |
| 3: Yoodler | Task 10 | AI companion rebranding |
| 4: Rooms | Task 11 | Meetings hub with tabs |
| 5: The Board | Task 12 | Kanban hub wrapping existing board |
| 6: Pulse | Task 13 | Analytics hub |
| 7: Meeting Room | Task 14 | Yoodler Live branding |
| 8: Polish | Tasks 15-16 | Cleanup and verification |

**Total: 16 tasks across 8 phases**

Each task is independent enough to commit separately. The build should remain green after each task.

# AI Search, Smart Notifications & Blueprints — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered command palette (⌘K), a real-time smart notification system with SSE delivery, and fix the Blueprints tab to link to existing meeting templates.

**Architecture:** The command palette fans out a single query to 5 existing search functions via `Promise.allSettled` and displays grouped results in a Radix Dialog. Notifications use a new MongoDB model with TTL, 4 API routes, and an SSE stream via Redis pub/sub on `notifications:{userId}`. Trigger points are wired into existing API routes (message send, meeting create, task assign). The Blueprints fix is a single line change pointing to `/meetings/templates`.

**Tech Stack:** Next.js 15, TypeScript, MongoDB/Mongoose, Redis/ioredis, Radix UI Dialog/Popover, Framer Motion, Lucide Icons, Zod

---

## Task 1: Fix Blueprints Tab (5 min)

**Files:**
- Modify: `src/app/(app)/meetings/MeetingsClient.tsx:432-434`

**Step 1: Replace the Blueprints empty state with a link to templates**

In `MeetingsClient.tsx`, find the blueprints tab content (line 432-434):

```tsx
{activeTab === "blueprints" && (
  <EmptyState title="Meeting templates coming soon" description="Create reusable meeting blueprints with agendas, timers, and auto-assigned roles." />
)}
```

Replace with:

```tsx
{activeTab === "blueprints" && (
  <div className="flex flex-col items-center gap-4 py-12">
    <p className="text-sm text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
      Create reusable meeting blueprints with agendas, timers, and auto-assigned roles.
    </p>
    <Link
      href="/meetings/templates"
      className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-5 py-2.5 text-sm font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)] transition-all hover:shadow-[4px_4px_0_var(--border-strong)] hover:translate-x-[-2px] hover:translate-y-[-2px]"
      style={{ fontFamily: "var(--font-heading)" }}
    >
      <Plus size={16} />
      Manage Templates
    </Link>
  </div>
)}
```

Note: `Link` and `Plus` are already imported at the top of MeetingsClient.tsx.

**Step 2: Verify build**

Run: `npx next build`
Expected: Zero errors

**Step 3: Commit**

```bash
git add src/app/\(app\)/meetings/MeetingsClient.tsx
git commit -m "feat: link Blueprints tab to existing meeting templates page"
```

---

## Task 2: Create Search API Route

**Files:**
- Create: `src/app/api/search/route.ts`
- Create: `src/app/api/search/__tests__/route.test.ts`

**Step 1: Write the test**

Create `src/app/api/search/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));
vi.mock("@/lib/infra/db/models/user", () => {
  const find = vi.fn();
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/meeting", () => {
  const find = vi.fn();
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/direct-message", () => {
  const find = vi.fn();
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/conversation", () => {
  const find = vi.fn();
  return { default: { find } };
});
vi.mock("@/lib/board/tools", () => ({
  searchBoardTasks: vi.fn(),
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import User from "@/lib/infra/db/models/user";
import Meeting from "@/lib/infra/db/models/meeting";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

function makeRequest(query: string): Request {
  return new Request(`http://localhost:3000/api/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
  }) as unknown as Request;
}

// Import route after mocks
const { GET } = await import("../route");

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue("user123");
  });

  it("returns 400 when query is missing", async () => {
    const req = new Request("http://localhost:3000/api/search") as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when query is too short", async () => {
    const req = makeRequest("a");
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("returns grouped results on valid query", async () => {
    // Mock User.find chain
    const mockUserChain = {
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { _id: "u1", name: "Alice", displayName: "Alice A", avatarUrl: null, status: "online", mode: "normal" },
      ]),
    };
    vi.mocked(User.find).mockReturnValue(mockUserChain as any);

    // Mock Meeting.find chain
    const mockMeetingChain = {
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(Meeting.find).mockReturnValue(mockMeetingChain as any);

    // Mock other sources return empty (they use allSettled so rejected = no results)
    const req = makeRequest("alice");
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty("people");
    expect(json.data).toHaveProperty("meetings");
    expect(json.data).toHaveProperty("tasks");
    expect(json.data.people).toHaveLength(1);
    expect(json.data.people[0].name).toBe("Alice");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/search/__tests__/route.test.ts`
Expected: FAIL — module not found

**Step 3: Write the search API route**

Create `src/app/api/search/route.ts`:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import Meeting from "@/lib/infra/db/models/meeting";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { searchBoardTasks } from "@/lib/board/tools";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:search");

const MAX_PER_CATEGORY = 5;

/**
 * GET /api/search?q=<query>
 * Global search across people, meetings, messages, tasks, and drive files.
 * Returns grouped results with max 5 per category.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    throw new BadRequestError("Search query must be at least 2 characters.");
  }
  if (q.length > 200) {
    throw new BadRequestError("Search query must be 200 characters or fewer.");
  }

  await connectDB();

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const userOid = new mongoose.Types.ObjectId(userId);

  // Fan out to all search sources concurrently
  const [peopleResult, meetingsResult, messagesResult, tasksResult] =
    await Promise.allSettled([
      // 1. People
      User.find({
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { displayName: { $regex: escaped, $options: "i" } },
        ],
      })
        .select("name displayName avatarUrl status mode")
        .limit(MAX_PER_CATEGORY)
        .lean(),

      // 2. Meetings (user is host or participant)
      Meeting.find({
        title: { $regex: escaped, $options: "i" },
        $or: [
          { hostId: userOid },
          { "participants.userId": userOid },
        ],
      })
        .select("title code status scheduledAt type")
        .limit(MAX_PER_CATEGORY)
        .lean(),

      // 3. Messages across user's conversations
      (async () => {
        // Get user's conversation IDs first
        const convs = await Conversation.find({
          "participants.userId": userOid,
        })
          .select("_id")
          .lean();
        const convIds = convs.map((c) => c._id);
        if (convIds.length === 0) return [];

        return DirectMessage.find({
          conversationId: { $in: convIds },
          content: { $regex: escaped, $options: "i" },
          deleted: { $ne: true },
        })
          .sort({ createdAt: -1 })
          .limit(MAX_PER_CATEGORY)
          .select("content conversationId senderId createdAt")
          .populate("senderId", "name displayName avatarUrl")
          .lean();
      })(),

      // 4. Tasks
      searchBoardTasks(userId, { query: q }),
    ]);

  // Extract results, defaulting to empty on failure
  const people =
    peopleResult.status === "fulfilled"
      ? peopleResult.value.map((u) => ({
          id: u._id.toString(),
          name: u.name,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl || null,
          status: u.mode === "invisible" ? "offline" : u.status,
        }))
      : [];

  const meetings =
    meetingsResult.status === "fulfilled"
      ? meetingsResult.value.map((m) => ({
          id: m._id.toString(),
          title: m.title,
          code: m.code,
          status: m.status,
          scheduledAt: m.scheduledAt || null,
          type: m.type,
        }))
      : [];

  const messages =
    messagesResult.status === "fulfilled"
      ? messagesResult.value.map((msg: any) => ({
          id: msg._id.toString(),
          content:
            msg.content.length > 120
              ? msg.content.slice(0, 120) + "…"
              : msg.content,
          conversationId: msg.conversationId.toString(),
          sender: msg.senderId
            ? {
                name: msg.senderId.name || msg.senderId.displayName,
                avatarUrl: msg.senderId.avatarUrl || null,
              }
            : null,
          createdAt: msg.createdAt,
        }))
      : [];

  // Tasks come back as ToolResult { success, data }
  let tasks: Array<{ id: string; title: string; priority?: string; dueDate?: string }> = [];
  if (tasksResult.status === "fulfilled") {
    const result = tasksResult.value;
    if (result.success && Array.isArray(result.data)) {
      tasks = result.data.slice(0, MAX_PER_CATEGORY).map((t: any) => ({
        id: t.id,
        title: t.title,
        priority: t.priority || null,
        dueDate: t.dueDate || null,
      }));
    }
  }

  // Log partial failures for monitoring
  const failures = [peopleResult, meetingsResult, messagesResult, tasksResult]
    .filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    log.warn(
      { failureCount: failures.length, query: q },
      "Some search sources failed",
    );
  }

  return successResponse({ people, meetings, messages, tasks });
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/search/__tests__/route.test.ts`
Expected: PASS

**Step 5: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 6: Commit**

```bash
git add src/app/api/search/route.ts src/app/api/search/__tests__/route.test.ts
git commit -m "feat: add global search API with fan-out to people, meetings, messages, tasks"
```

---

## Task 3: Create CommandPalette Component

**Files:**
- Create: `src/components/layout/CommandPalette.tsx`
- Modify: `src/components/layout/AppTopbar.tsx`

**Step 1: Create the CommandPalette component**

Create `src/components/layout/CommandPalette.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Video, MessageCircle, CheckSquare, User, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface SearchResults {
  people: Array<{ id: string; name: string; displayName: string; avatarUrl: string | null; status: string }>;
  meetings: Array<{ id: string; title: string; code: string; status: string; scheduledAt: string | null; type: string }>;
  messages: Array<{ id: string; content: string; conversationId: string; sender: { name: string; avatarUrl: string | null } | null; createdAt: string }>;
  tasks: Array<{ id: string; title: string; priority: string | null; dueDate: string | null }>;
}

type ResultItem =
  | { category: "people"; data: SearchResults["people"][number] }
  | { category: "meetings"; data: SearchResults["meetings"][number] }
  | { category: "messages"; data: SearchResults["messages"][number] }
  | { category: "tasks"; data: SearchResults["tasks"][number] };

const CATEGORY_CONFIG = {
  meetings: { label: "Meetings", icon: Video },
  messages: { label: "Messages", icon: MessageCircle },
  tasks: { label: "Tasks", icon: CheckSquare },
  people: { label: "People", icon: User },
} as const;

const RECENT_SEARCHES_KEY = "yoodle:recent-searches";
const MAX_RECENT = 5;

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const router = useRouter();

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      if (json.success) {
        setResults(json.data);
        setSelectedIndex(0);
      }
    } catch {
      // Silently fail — user sees empty results
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  // Flatten results for keyboard navigation
  const flatResults: ResultItem[] = results
    ? [
        ...results.meetings.map((d) => ({ category: "meetings" as const, data: d })),
        ...results.messages.map((d) => ({ category: "messages" as const, data: d })),
        ...results.tasks.map((d) => ({ category: "tasks" as const, data: d })),
        ...results.people.map((d) => ({ category: "people" as const, data: d })),
      ]
    : [];

  const saveRecentSearch = (q: string) => {
    const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const navigateToResult = (item: ResultItem) => {
    saveRecentSearch(query);
    setOpen(false);

    switch (item.category) {
      case "meetings":
        router.push(`/meetings/${item.data.id}`);
        break;
      case "messages":
        router.push(`/messages/${item.data.conversationId}`);
        break;
      case "tasks":
        router.push("/board");
        break;
      case "people":
        router.push("/messages");
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          navigateToResult(flatResults[selectedIndex]);
        }
        break;
    }
  };

  // Group flat results by category for rendering
  const groupedCategories = (["meetings", "messages", "tasks", "people"] as const).filter(
    (cat) => results && results[cat].length > 0,
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                className="fixed left-1/2 top-[15%] z-[201] w-full max-w-xl -translate-x-1/2 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden"
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                role="combobox"
                aria-expanded={flatResults.length > 0}
                aria-haspopup="listbox"
              >
                {/* Search input */}
                <div className="flex items-center gap-3 border-b-2 border-[var(--border)] px-4 py-3">
                  {loading ? (
                    <Loader2 size={18} className="text-[var(--text-muted)] animate-spin" />
                  ) : (
                    <Search size={18} className="text-[var(--text-muted)]" />
                  )}
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search across meetings, messages, tasks, and more…"
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                    style={{ fontFamily: "var(--font-body)" }}
                    aria-label="Search"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Dialog.Close asChild>
                    <button
                      className="rounded-lg p-1 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                      aria-label="Close search"
                    >
                      <X size={16} className="text-[var(--text-muted)]" />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Results */}
                <div className="max-h-[400px] overflow-y-auto p-2" role="listbox">
                  {/* Empty state */}
                  {!results && !loading && query.length < 2 && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                        Search across meetings, messages, tasks, and more
                      </p>
                      {recentSearches.length > 0 && (
                        <div className="mt-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
                            Recent
                          </p>
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {recentSearches.map((s) => (
                              <button
                                key={s}
                                onClick={() => { setQuery(s); search(s); }}
                                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                                style={{ fontFamily: "var(--font-body)" }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Loading skeleton */}
                  {loading && query.length >= 2 && !results && (
                    <div className="space-y-3 px-2 py-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                          <div className="h-8 w-8 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3 w-32 rounded bg-[var(--surface-hover)] animate-pulse" />
                            <div className="h-2.5 w-48 rounded bg-[var(--surface-hover)] animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No results */}
                  {results && flatResults.length === 0 && !loading && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                        No results for &ldquo;{query}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Grouped results */}
                  {groupedCategories.map((cat) => {
                    const config = CATEGORY_CONFIG[cat];
                    const Icon = config.icon;
                    const items = results![cat];

                    return (
                      <div key={cat} className="mb-1">
                        <p
                          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          {config.label}
                        </p>
                        {items.map((item: any, idx: number) => {
                          // Calculate global index for keyboard navigation
                          const globalIndex = flatResults.findIndex(
                            (r) => r.category === cat && r.data === item,
                          );
                          const isSelected = globalIndex === selectedIndex;

                          return (
                            <button
                              key={item.id}
                              onClick={() => navigateToResult({ category: cat, data: item })}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-[#FFE600]/20"
                                  : "hover:bg-[var(--surface-hover)]"
                              }`}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                isSelected ? "bg-[#FFE600] text-[#0A0A0A]" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
                              }`}>
                                <Icon size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm font-bold text-[var(--text-primary)] truncate"
                                  style={{ fontFamily: "var(--font-heading)" }}
                                >
                                  {item.title || item.displayName || item.name || item.content}
                                </p>
                                {cat === "messages" && item.sender && (
                                  <p className="text-xs text-[var(--text-secondary)] truncate" style={{ fontFamily: "var(--font-body)" }}>
                                    {item.sender.name}
                                  </p>
                                )}
                                {cat === "meetings" && item.status && (
                                  <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
                                    {item.status}{item.scheduledAt ? ` · ${new Date(item.scheduledAt).toLocaleDateString()}` : ""}
                                  </p>
                                )}
                                {cat === "tasks" && item.priority && (
                                  <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
                                    {item.priority}{item.dueDate ? ` · Due ${new Date(item.dueDate).toLocaleDateString()}` : ""}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                {flatResults.length > 0 && (
                  <div className="flex items-center justify-between border-t-2 border-[var(--border)] px-4 py-2">
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]" style={{ fontFamily: "var(--font-heading)" }}>
                      <kbd className="rounded border border-[var(--border)] bg-[var(--surface-hover)] px-1 py-0.5 font-bold">↑↓</kbd>
                      <span>Navigate</span>
                      <kbd className="rounded border border-[var(--border)] bg-[var(--surface-hover)] px-1 py-0.5 font-bold">↵</kbd>
                      <span>Open</span>
                      <kbd className="rounded border border-[var(--border)] bg-[var(--surface-hover)] px-1 py-0.5 font-bold">Esc</kbd>
                      <span>Close</span>
                    </div>
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
```

**Step 2: Wire CommandPalette into AppTopbar**

Modify `src/components/layout/AppTopbar.tsx`:

Add import at line 2 (after lucide imports):
```tsx
import CommandPalette from "./CommandPalette";
```

Replace the static search badge div (lines 29-33) with a clickable trigger + the CommandPalette:

```tsx
<CommandPalette />
<button
  onClick={() => {
    // Trigger the ⌘K shortcut programmatically
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }}
  className="flex items-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2 px-3 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
  aria-label="Open search (⌘K)"
>
  <Search size={16} />
  <span className="text-sm hidden sm:inline" style={{ fontFamily: "var(--font-body)" }}>Search</span>
  <kbd className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]" style={{ fontFamily: "var(--font-heading)" }}>⌘K</kbd>
</button>
```

**Step 3: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 4: Commit**

```bash
git add src/components/layout/CommandPalette.tsx src/components/layout/AppTopbar.tsx
git commit -m "feat: add command palette (⌘K) with global search across all categories"
```

---

## Task 4: Create Notification Model

**Files:**
- Create: `src/lib/infra/db/models/notification.ts`

**Step 1: Create the Notification model**

Create `src/lib/infra/db/models/notification.ts`:

```typescript
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "mention",
  "reply",
  "meeting_invite",
  "meeting_starting",
  "task_assigned",
  "task_due",
  "ai_action_complete",
  "ghost_room_expiring",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["urgent", "normal", "low"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_SOURCE_TYPES = ["meeting", "message", "task", "ai"] as const;
export type NotificationSourceType = (typeof NOTIFICATION_SOURCE_TYPES)[number];

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  read: boolean;
  priority: NotificationPriority;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDocument extends INotification, Document {
  _id: Types.ObjectId;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    sourceType: { type: String, enum: NOTIFICATION_SOURCE_TYPES, required: true },
    sourceId: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
    priority: { type: String, enum: NOTIFICATION_PRIORITIES, default: "normal" },
  },
  { timestamps: true },
);

// Compound index: unread notifications for a user, newest first
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// TTL index: auto-delete after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification: Model<INotificationDocument> =
  mongoose.models.Notification ||
  mongoose.model<INotificationDocument>("Notification", notificationSchema);

export default Notification;
```

**Step 2: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 3: Commit**

```bash
git add src/lib/infra/db/models/notification.ts
git commit -m "feat: add Notification model with TTL, priority, and compound indexes"
```

---

## Task 5: Create Notification API Routes

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/[id]/route.ts`
- Create: `src/app/api/notifications/read-all/route.ts`
- Create: `src/app/api/notifications/__tests__/route.test.ts`

**Step 1: Write the tests**

Create `src/app/api/notifications/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));
vi.mock("@/lib/infra/db/models/notification", () => {
  const find = vi.fn();
  const countDocuments = vi.fn();
  return { default: { find, countDocuments } };
});

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import Notification from "@/lib/infra/db/models/notification";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedFind = vi.mocked(Notification.find);
const mockedCount = vi.mocked(Notification.countDocuments);

const { GET } = await import("../route");

function makeRequest(qs = ""): Request {
  return new Request(`http://localhost:3000/api/notifications${qs}`) as unknown as Request;
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue("user123");
  });

  it("returns paginated notifications with unread count", async () => {
    const mockChain = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: "n1",
          userId: "user123",
          type: "mention",
          title: "New mention",
          body: "Alice mentioned you",
          sourceType: "message",
          sourceId: "msg1",
          read: false,
          priority: "urgent",
          createdAt: new Date(),
        },
      ]),
    };
    mockedFind.mockReturnValue(mockChain as any);
    mockedCount
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1); // unread

    const req = makeRequest("?page=1&limit=20");
    const res = await GET(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.notifications).toHaveLength(1);
    expect(json.data.unreadCount).toBe(1);
    expect(json.data.pagination).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/notifications/__tests__/route.test.ts`
Expected: FAIL — module not found

**Step 3: Create GET /api/notifications**

Create `src/app/api/notifications/route.ts`:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import Notification from "@/lib/infra/db/models/notification";

/**
 * GET /api/notifications?page=1&limit=20
 * Returns paginated notifications for the authenticated user.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "20", 10) || 20, 50));

  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);
  const filter = { userId: userOid };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, read: false }),
  ]);

  return successResponse({
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
```

**Step 4: Create PATCH /api/notifications/[id]**

Create `src/app/api/notifications/[id]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Notification from "@/lib/infra/db/models/notification";

/**
 * PATCH /api/notifications/[id]
 * Mark a single notification as read.
 */
export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid notification ID.");
  }

  await connectDB();

  const notification = await Notification.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    },
    { $set: { read: true } },
    { new: true },
  ).lean();

  if (!notification) {
    throw new NotFoundError("Notification not found.");
  }

  return successResponse(notification);
});
```

**Step 5: Create POST /api/notifications/read-all**

Create `src/app/api/notifications/read-all/route.ts`:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import Notification from "@/lib/infra/db/models/notification";

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const result = await Notification.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), read: false },
    { $set: { read: true } },
  );

  return successResponse({ modifiedCount: result.modifiedCount });
});
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/app/api/notifications/__tests__/route.test.ts`
Expected: PASS

**Step 7: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 8: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat: add notification CRUD routes (list, mark-read, mark-all-read)"
```

---

## Task 6: Create Notification SSE Stream

**Files:**
- Create: `src/app/api/notifications/stream/route.ts`

**Step 1: Create the SSE endpoint**

Create `src/app/api/notifications/stream/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { sharedSubscriber } from "@/lib/infra/redis/pubsub";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:notifications:stream");

/**
 * GET /api/notifications/stream
 * SSE endpoint for real-time notification delivery.
 * Subscribes to Redis channel `notifications:{userId}`.
 */
export async function GET(req: NextRequest) {
  try {
    await checkRateLimit(req, "general");
    const userId = await getUserIdFromRequest(req);

    let unsubscribe: (() => Promise<void>) | undefined;

    try {
      let enqueueMessage: ((channel: string, message: string) => void) | null = null;

      unsubscribe = await sharedSubscriber.subscribe(
        `notifications:${userId}`,
        (channel, message) => {
          if (enqueueMessage) {
            enqueueMessage(channel, message);
          }
        },
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Heartbeat every 15s
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch {
              clearInterval(heartbeat);
            }
          }, 15000);

          // Wire message handler
          enqueueMessage = (_channel: string, message: string) => {
            try {
              const parsed = JSON.parse(message);
              const eventType = parsed.type || "notification";
              controller.enqueue(
                encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(parsed.data || parsed)}\n\n`),
              );
            } catch {
              try {
                controller.enqueue(encoder.encode(`data: ${message}\n\n`));
              } catch {
                // Stream closed
              }
            }
          };

          // Cleanup on client disconnect
          req.signal.addEventListener("abort", () => {
            clearInterval(heartbeat);
            enqueueMessage = null;
            unsubscribe?.().catch(() => {});
            try {
              controller.close();
            } catch {
              // Already closed
            }
          });
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      if (unsubscribe) {
        await unsubscribe().catch(() => {});
      }
      log.error({ err }, "Failed to subscribe for notification SSE stream");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503 },
      );
    }
  } catch (err) {
    const isAuthError =
      err instanceof Error && (err.name === "UnauthorizedError" || err.message === "Unauthorized");

    if (!isAuthError) {
      log.error({ err }, "Notification SSE stream setup failed");
    }

    return new Response(
      JSON.stringify({ error: isAuthError ? "Unauthorized" : "Internal server error" }),
      { status: isAuthError ? 401 : 500 },
    );
  }
}
```

**Step 2: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 3: Commit**

```bash
git add src/app/api/notifications/stream/route.ts
git commit -m "feat: add notification SSE stream via Redis pub/sub"
```

---

## Task 7: Create Notification Helper (Publish)

**Files:**
- Create: `src/lib/notifications/publish.ts`

**Step 1: Create the publish utility**

Create `src/lib/notifications/publish.ts`:

```typescript
import mongoose from "mongoose";
import Notification, {
  type NotificationType,
  type NotificationPriority,
  type NotificationSourceType,
} from "@/lib/infra/db/models/notification";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import connectDB from "@/lib/infra/db/client";

const log = createLogger("notifications:publish");

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  priority?: NotificationPriority;
}

/**
 * Create a notification in MongoDB and publish to Redis for real-time delivery.
 * Safe to call from any API route — catches and logs errors instead of throwing.
 */
export async function publishNotification(
  input: CreateNotificationInput,
): Promise<void> {
  try {
    await connectDB();

    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      body: input.body,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      priority: input.priority || "normal",
    });

    // Publish to Redis for SSE delivery
    try {
      const redis = getRedisClient();
      await redis.publish(
        `notifications:${input.userId}`,
        JSON.stringify({
          type: "notification",
          data: {
            id: notification._id.toString(),
            type: notification.type,
            title: notification.title,
            body: notification.body,
            sourceType: notification.sourceType,
            sourceId: notification.sourceId,
            priority: notification.priority,
            read: false,
            createdAt: notification.createdAt,
          },
        }),
      );
    } catch (err) {
      log.warn({ err, userId: input.userId }, "Redis publish failed for notification (saved to DB)");
    }
  } catch (err) {
    log.error({ err, userId: input.userId, type: input.type }, "Failed to create notification");
  }
}

/**
 * Publish notifications to multiple users.
 */
export async function publishNotificationToMany(
  userIds: string[],
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  await Promise.allSettled(
    userIds.map((userId) => publishNotification({ ...input, userId })),
  );
}
```

**Step 2: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 3: Commit**

```bash
git add src/lib/notifications/publish.ts
git commit -m "feat: add notification publish utility with MongoDB + Redis delivery"
```

---

## Task 8: Wire Notification Triggers Into Existing APIs

**Files:**
- Modify: `src/app/api/conversations/[id]/messages/route.ts` (message send — @mention)
- Modify: `src/app/api/meetings/route.ts` (meeting create — invite)
- Modify: `src/app/api/tasks/route.ts` OR `src/app/api/tasks/[taskId]/route.ts` (task assign)

**Step 1: Add @mention notification to message send**

In `src/app/api/conversations/[id]/messages/route.ts`, add import at top:

```typescript
import { publishNotification } from "@/lib/notifications/publish";
```

After the Redis publish block (after the message is created and published to chat), add mention detection:

```typescript
// Detect @mentions and create notifications
const mentionRegex = /@(\w+)/g;
const mentions = [...(body.content || "").matchAll(mentionRegex)];
if (mentions.length > 0) {
  // Look up mentioned users (non-blocking)
  Promise.resolve().then(async () => {
    try {
      const mentionNames = mentions.map((m) => m[1]);
      const mentionedUsers = await User.find({
        $or: [
          { name: { $in: mentionNames.map((n) => new RegExp(`^${n}$`, "i")) } },
          { displayName: { $in: mentionNames.map((n) => new RegExp(`^${n}$`, "i")) } },
        ],
      }).select("_id name").lean();

      const senderName = user?.displayName || user?.name || "Someone";
      for (const mentioned of mentionedUsers) {
        if (mentioned._id.toString() !== userId) {
          await publishNotification({
            userId: mentioned._id.toString(),
            type: "mention",
            title: `${senderName} mentioned you`,
            body: (body.content || "").slice(0, 120),
            sourceType: "message",
            sourceId: id,
            priority: "urgent",
          });
        }
      }
    } catch (err) {
      // Non-critical — notification failure shouldn't break message send
    }
  });
}
```

**Step 2: Add meeting invite notification**

In `src/app/api/meetings/route.ts` POST handler, add import:

```typescript
import { publishNotificationToMany } from "@/lib/notifications/publish";
```

After the meeting is created, add:

```typescript
// Notify invited participants (non-blocking)
const invitedUserIds = (body.participants || [])
  .map((p: any) => p.userId?.toString())
  .filter((id: string | undefined) => id && id !== userId);

if (invitedUserIds.length > 0) {
  publishNotificationToMany(invitedUserIds, {
    type: "meeting_invite",
    title: `Invited to: ${meeting.title}`,
    body: `You've been invited to a meeting`,
    sourceType: "meeting",
    sourceId: meeting._id.toString(),
    priority: "urgent",
  }).catch(() => {}); // Fire-and-forget
}
```

**Step 3: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing tests should not break — notifications are fire-and-forget)

**Step 5: Commit**

```bash
git add src/app/api/conversations/[id]/messages/route.ts src/app/api/meetings/route.ts
git commit -m "feat: wire notification triggers into message @mentions and meeting invites"
```

---

## Task 9: Create useNotifications Hook

**Files:**
- Create: `src/hooks/useNotifications.ts`

**Step 1: Create the hook**

Create `src/hooks/useNotifications.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

export interface NotificationItem {
  id: string;
  _id?: string;
  type: string;
  title: string;
  body: string;
  sourceType: string;
  sourceId: string;
  read: boolean;
  priority: string;
  createdAt: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?page=1&limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotifications(
          json.data.notifications.map((n: any) => ({
            ...n,
            id: n._id || n.id,
          })),
        );
        setUnreadCount(json.data.unreadCount);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE connection for real-time notifications
  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const es = new EventSource("/api/notifications/stream", {
      withCredentials: true,
    });
    eventSourceRef.current = es;

    es.addEventListener("notification", (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification: NotificationItem = {
          ...data,
          id: data.id || data._id,
        };

        setNotifications((prev) => [notification, ...prev]);

        // Only increment badge for urgent/normal priority
        if (notification.priority !== "low") {
          setUnreadCount((prev) => prev + 1);
        }
      } catch {
        // Invalid event data
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [user, fetchNotifications]);

  // Mark single notification as read
  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {
      // Revert on failure
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}
```

**Step 2: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 3: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "feat: add useNotifications hook with SSE real-time delivery"
```

---

## Task 10: Create Notification Bell UI

**Files:**
- Create: `src/components/layout/NotificationBell.tsx`
- Modify: `src/components/layout/AppTopbar.tsx`

**Step 1: Create the NotificationBell component**

Create `src/components/layout/NotificationBell.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Video, MessageCircle, CheckSquare, Sparkles, Ghost } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications, type NotificationItem } from "@/hooks/useNotifications";
import { useRouter } from "next/navigation";

const TYPE_ICONS: Record<string, typeof Bell> = {
  mention: MessageCircle,
  reply: MessageCircle,
  meeting_invite: Video,
  meeting_starting: Video,
  task_assigned: CheckSquare,
  task_due: CheckSquare,
  ai_action_complete: Sparkles,
  ghost_room_expiring: Ghost,
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.read) {
      markRead(notification.id);
    }

    // Navigate based on source type
    switch (notification.sourceType) {
      case "meeting":
        router.push(`/meetings/${notification.sourceId}`);
        break;
      case "message":
        router.push(`/messages/${notification.sourceId}`);
        break;
      case "task":
        router.push("/board");
        break;
      default:
        break;
    }
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF6B6B] px-1 text-[9px] font-bold text-white"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </button>
      </Popover.Trigger>

      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content asChild sideOffset={8} align="end">
              <motion.div
                className="z-[100] w-[360px] max-h-[480px] rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden"
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b-2 border-[var(--border)] px-4 py-3">
                  <h3
                    className="text-sm font-bold text-[var(--text-primary)]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <CheckCheck size={12} />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification list */}
                <div className="overflow-y-auto max-h-[400px]">
                  {loading && notifications.length === 0 && (
                    <div className="space-y-2 p-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-3 rounded-xl p-3">
                          <div className="h-8 w-8 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3 w-32 rounded bg-[var(--surface-hover)] animate-pulse" />
                            <div className="h-2.5 w-48 rounded bg-[var(--surface-hover)] animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && notifications.length === 0 && (
                    <div className="px-4 py-12 text-center">
                      <Bell size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
                      <p
                        className="text-sm text-[var(--text-muted)]"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        No notifications yet
                      </p>
                    </div>
                  )}

                  {notifications.map((notification) => {
                    const Icon = TYPE_ICONS[notification.type] || Bell;
                    const isUrgent = notification.priority === "urgent";

                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex w-full gap-3 px-4 py-3 text-left transition-colors cursor-pointer hover:bg-[var(--surface-hover)] ${
                          !notification.read ? "bg-[#FFE600]/5" : ""
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                            isUrgent
                              ? "bg-[#FF6B6B]/10 text-[#FF6B6B]"
                              : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
                          }`}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm truncate ${
                                !notification.read
                                  ? "font-bold text-[var(--text-primary)]"
                                  : "text-[var(--text-secondary)]"
                              }`}
                              style={{ fontFamily: "var(--font-heading)" }}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#FFE600]" />
                            )}
                          </div>
                          <p
                            className="text-xs text-[var(--text-muted)] truncate mt-0.5"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            {notification.body}
                          </p>
                          <p
                            className="text-[10px] text-[var(--text-muted)] mt-1"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            {timeAgo(notification.createdAt)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
```

**Step 2: Add NotificationBell to AppTopbar**

Modify `src/components/layout/AppTopbar.tsx`:

Add import:
```tsx
import NotificationBell from "./NotificationBell";
```

In the right actions section (before the user dropdown, around line 37), add:
```tsx
<NotificationBell />
```

The right actions section should look like:
```tsx
{/* Right actions */}
<div className="flex items-center gap-3">
  <NotificationBell />
  {/* User dropdown */}
  <DropdownMenu.Root>
    ...
```

**Step 3: Run build**

Run: `npx next build`
Expected: Zero errors

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/components/layout/NotificationBell.tsx src/components/layout/AppTopbar.tsx
git commit -m "feat: add notification bell UI with real-time badge and dropdown panel"
```

---

## Verification

After all tasks:

1. `npx vitest run` — all tests pass
2. `npx next build` — zero errors
3. Visual check:
   - ⌘K opens command palette, typing shows results grouped by category
   - Keyboard navigation (↑↓ Enter Esc) works in command palette
   - Bell icon shows in topbar with unread count badge
   - Clicking bell shows notification dropdown with mark-read
   - Blueprints tab shows "Manage Templates" button linking to `/meetings/templates`
   - Recent searches stored and shown in command palette empty state

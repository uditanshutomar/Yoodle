# Orphaned Features Frontend Wiring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire 6 fully-implemented backend APIs to frontend UI so every feature is accessible to users.

**Architecture:** Each feature is a self-contained UI addition — a new component or a modification to an existing one. No backend changes needed. All APIs already return correct data shapes. Follow existing patterns: Yoodle card styling (`rounded-2xl border-2 shadow-[var(--shadow-card)]`), framer-motion animations, fetching with `credentials: "include"`.

**Tech Stack:** React 18, Next.js 15, TypeScript, Tailwind CSS, framer-motion, lucide-react icons

---

### Task 1: CopilotPanel Component

**Files:**
- Create: `src/components/meeting/CopilotPanel.tsx`

**Step 1: Create the CopilotPanel component**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, X, Wifi, WifiOff } from "lucide-react";

interface CopilotMessage {
  id: string;
  type: string;
  text: string;
  timestamp: number;
}

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
}

export default function CopilotPanel({ isOpen, onClose, meetingId }: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE subscription
  useEffect(() => {
    if (!isOpen || !meetingId) return;

    const es = new EventSource(`/api/meetings/${meetingId}/copilot`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") {
          setConnected(true);
          return;
        }
        if (data.type === "heartbeat") return;

        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: data.type || "suggestion",
            text: data.text || data.message || JSON.stringify(data),
            timestamp: Date.now(),
          },
        ]);
      } catch {
        // Ignore parse errors from heartbeats
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [isOpen, meetingId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 28 }}
      className="absolute right-0 top-0 bottom-0 z-30 w-full sm:w-[340px] border-l-2 border-[var(--border-strong)] bg-[var(--background)] shadow-[-4px_0_0_var(--border-strong)] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-strong)]">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#A855F7]" />
          <span className="font-bold text-sm" style={{ fontFamily: "var(--font-heading)" }}>
            Copilot
          </span>
          {connected ? (
            <span className="flex items-center gap-1 text-[10px] text-green-500">
              <Wifi size={10} /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-yellow-500">
              <WifiOff size={10} /> Connecting…
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 hover:bg-[var(--surface)] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-[var(--text-secondary)] mt-12">
            <Sparkles size={24} className="mx-auto mb-2 text-[#A855F7] opacity-50" />
            <p>AI suggestions will appear here during the meeting.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={12} className="text-[#A855F7]" />
              <span className="text-[10px] text-[var(--text-secondary)]">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-[var(--text-primary)] leading-relaxed">{msg.text}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
```

**Step 2: Verify file was created**

Run: `ls src/components/meeting/CopilotPanel.tsx`

**Step 3: Commit**

```bash
git add src/components/meeting/CopilotPanel.tsx
git commit -m "feat: add CopilotPanel component for real-time AI suggestions"
```

---

### Task 2: Wire Copilot into Meeting Controls + Room Page

**Files:**
- Modify: `src/components/meeting/MeetingControls.tsx` (lines 22-45 props, insert after line 272)
- Modify: `src/app/(app)/meetings/[meetingId]/room/page.tsx` (lines 194-199 state, ~1032-1061 controls)

**Step 1: Add copilot props to MeetingControls**

In `MeetingControls.tsx`, add to the props interface (after `onToggleLayout`):
```typescript
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
  unreadCopilotCount?: number;
```

Destructure them in the component function.

**Step 2: Add Copilot button to control bar**

After the Participants ControlButton (line ~272) and before the Layout button (line ~275), insert:

```typescript
{onToggleCopilot && (
  <ControlButton
    onClick={onToggleCopilot}
    active={isCopilotOpen}
    label="Copilot"
    badge={!isCopilotOpen && (unreadCopilotCount ?? 0) > 0}
  >
    <Sparkles
      size={18}
      className={isCopilotOpen ? "text-[#A855F7]" : ""}
    />
  </ControlButton>
)}
```

Add `Sparkles` to the lucide-react import.

**Step 3: Wire Copilot state in room page**

In `room/page.tsx`, add state (after line ~199):
```typescript
const [showCopilot, setShowCopilot] = useState(false);
const [copilotUnread, setCopilotUnread] = useState(0);
```

Add the CopilotPanel import at the top:
```typescript
import CopilotPanel from "@/components/meeting/CopilotPanel";
```

**Step 4: Add CopilotPanel to the room JSX**

After the Participants panel AnimatePresence block (after line ~948), add:
```typescript
<AnimatePresence>
  {showCopilot && (
    <CopilotPanel
      isOpen={showCopilot}
      onClose={() => setShowCopilot(false)}
      meetingId={meetingId}
    />
  )}
</AnimatePresence>
```

**Step 5: Add copilot props to MeetingControls usage**

In the MeetingControls JSX (line ~1032), add these props:
```typescript
isCopilotOpen={showCopilot}
onToggleCopilot={() => {
  setShowCopilot(!showCopilot);
  if (!showCopilot) setCopilotUnread(0);
}}
unreadCopilotCount={copilotUnread}
```

**Step 6: Build and verify**

Run: `npx next build`
Expected: 0 errors

**Step 7: Commit**

```bash
git add src/components/meeting/MeetingControls.tsx "src/app/(app)/meetings/[meetingId]/room/page.tsx"
git commit -m "feat: wire copilot panel into meeting room with control bar button"
```

---

### Task 3: Analytics Tab in MeetingDetail

**Files:**
- Modify: `src/components/dashboard/MeetingDetail.tsx` (lines 10-24 tab def, lines 54-66 state, lines 405-427 rendering)

**Step 1: Add tab definition**

In `MeetingDetail.tsx`, update the `Tab` type (line ~10) to include `"analytics"`:
```typescript
type Tab = "overview" | "mom" | "transcript" | "recording" | "analytics";
```

Add to the `TABS` array (after recording):
```typescript
{ key: "analytics", label: "Analytics" },
```

**Step 2: Add analytics state**

After `momError` state (line ~63), add:
```typescript
const [analyticsData, setAnalyticsData] = useState<Record<string, unknown> | null>(null);
const [loadingAnalytics, setLoadingAnalytics] = useState(false);
```

**Step 3: Add analytics fetch**

Inside the existing useEffect that fetches MoM/transcript/recordings, add:
```typescript
async function fetchAnalytics() {
  setLoadingAnalytics(true);
  try {
    const res = await fetch(`/api/meetings/${meeting.id}/analytics`, {
      credentials: "include",
      signal,
    });
    if (signal.aborted) return;
    if (res.ok) {
      const data = await res.json();
      if (data.data) setAnalyticsData(data.data);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error("[MeetingDetail] Analytics fetch error:", err);
  } finally {
    setLoadingAnalytics(false);
  }
}
fetchAnalytics();
```

**Step 4: Add tab disabled logic**

In the tab rendering, disable analytics tab when no data exists (same pattern as MoM tab):
```typescript
disabled={key === "analytics" && !analyticsData}
```

**Step 5: Add AnalyticsTab component inline**

Below the existing tab components (MoMTab, RealTranscriptTab, etc.), add:

```typescript
function AnalyticsTab({ data }: { data: Record<string, unknown> }) {
  const score = (data.meetingScore as number) || 0;
  const breakdown = (data.scoreBreakdown as Record<string, number>) || {};
  const speakers = (data.speakerStats as { name: string; talkTimePercent: number; wordCount: number }[]) || [];
  const highlights = (data.highlights as { timestamp: number; type: string; text: string }[]) || [];
  const decisions = (data.decisionCount as number) || 0;
  const actionItems = (data.actionItemCount as number) || 0;
  const completed = (data.actionItemsCompleted as number) || 0;

  const scoreColor = score >= 70 ? "#22C55E" : score >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Score */}
      <div className="flex items-center gap-6">
        <div className="relative h-20 w-20 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={scoreColor} strokeWidth="3"
              strokeDasharray={`${score} ${100 - score}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-black">{score}</span>
        </div>
        <div className="flex-1 space-y-2">
          {Object.entries(breakdown).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] w-32 capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-[#FFE600] rounded-full" style={{ width: `${val}%` }} />
              </div>
              <span className="text-xs font-medium w-8 text-right">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Decisions", value: decisions },
          { label: "Action Items", value: actionItems },
          { label: "Completed", value: completed },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border-2 border-[var(--border)] p-3 text-center">
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Speaker Stats */}
      {speakers.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-2">Speaker Breakdown</h4>
          <div className="space-y-2">
            {speakers.sort((a, b) => b.talkTimePercent - a.talkTimePercent).map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="text-xs w-24 truncate">{s.name}</span>
                <div className="flex-1 h-3 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[#06B6D4] rounded-full" style={{ width: `${s.talkTimePercent}%` }} />
                </div>
                <span className="text-xs font-medium w-12 text-right">{s.talkTimePercent}%</span>
                <span className="text-[10px] text-[var(--text-secondary)] w-16 text-right">{s.wordCount} words</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlights */}
      {highlights.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-2">Key Moments</h4>
          <div className="space-y-2">
            {highlights.map((h, i) => {
              const badgeColor = { decision: "#22C55E", disagreement: "#EF4444", commitment: "#3B82F6", key_point: "#F59E0B" }[h.type] || "#6B7280";
              return (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white flex-shrink-0" style={{ backgroundColor: badgeColor }}>
                    {h.type.replace("_", " ")}
                  </span>
                  <span className="text-[var(--text-primary)]">{h.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
```

**Step 6: Add analytics tab to render switch**

In the tab content AnimatePresence block (line ~405), add after the recording tab:
```typescript
{tab === "analytics" && analyticsData && (
  <AnalyticsTab key="analytics" data={analyticsData} />
)}
```

**Step 7: Build and verify**

Run: `npx next build`
Expected: 0 errors

**Step 8: Commit**

```bash
git add src/components/dashboard/MeetingDetail.tsx
git commit -m "feat: add analytics tab to meeting detail drawer"
```

---

### Task 4: Meeting Brief in Pre-Join Lobby + MeetingDetail Tab

**Files:**
- Modify: `src/app/(app)/meetings/[meetingId]/page.tsx` (lines 30-39 state, after line ~258 JSX)
- Modify: `src/components/dashboard/MeetingDetail.tsx` (tab def, render switch)

**Step 1: Add brief state to lobby page**

In the lobby page, add state:
```typescript
const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
const [loadingBrief, setLoadingBrief] = useState(false);
const [briefCollapsed, setBriefCollapsed] = useState(false);
```

**Step 2: Add brief fetch in lobby**

Add a useEffect to fetch brief on mount:
```typescript
useEffect(() => {
  if (!meetingId || !user) return;
  const controller = new AbortController();
  setLoadingBrief(true);
  fetch(`/api/meetings/${meetingId}/brief`, { credentials: "include", signal: controller.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((res) => { if (res?.data) setBrief(res.data); })
    .catch(() => {})
    .finally(() => setLoadingBrief(false));
  return () => controller.abort();
}, [meetingId, user]);
```

**Step 3: Add brief section to lobby JSX**

After the PreJoinLobby component and before the closing container div, add:

```typescript
{/* Meeting Brief */}
{(brief || loadingBrief) && (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="mt-6 w-full max-w-2xl mx-auto"
  >
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
      <button
        onClick={() => setBriefCollapsed(!briefCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-[var(--border)]"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#3B82F6]" />
          <span className="font-bold text-sm" style={{ fontFamily: "var(--font-heading)" }}>
            Meeting Brief
          </span>
          {brief?.status === "stale" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Stale</span>
          )}
        </div>
        <ChevronDown size={14} className={`transition-transform ${briefCollapsed ? "" : "rotate-180"}`} />
      </button>

      {!briefCollapsed && (
        <div className="p-4 space-y-4 text-sm">
          {loadingBrief && !brief ? (
            <div className="text-center py-6 text-[var(--text-secondary)]">
              <Loader2 size={20} className="mx-auto animate-spin mb-2" />
              Loading brief…
            </div>
          ) : brief ? (
            <>
              {(brief.agendaSuggestions as string[])?.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs uppercase text-[var(--text-secondary)] mb-1">Suggested Agenda</h4>
                  <ul className="space-y-1">
                    {(brief.agendaSuggestions as string[]).map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#FFE600] mt-1">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(brief.carryoverItems as { task: string; fromMeetingTitle: string }[])?.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs uppercase text-[var(--text-secondary)] mb-1">Carryover Items</h4>
                  <ul className="space-y-1">
                    {(brief.carryoverItems as { task: string; fromMeetingTitle: string }[]).map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#F59E0B] mt-1">↳</span>
                        <span>{c.task} <span className="text-[var(--text-secondary)]">from {c.fromMeetingTitle}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(brief.sources as { type: string; title: string; summary: string }[])?.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs uppercase text-[var(--text-secondary)] mb-1">Relevant Sources</h4>
                  <div className="space-y-1.5">
                    {(brief.sources as { type: string; title: string; summary: string }[]).slice(0, 5).map((s, i) => (
                      <div key={i} className="rounded-lg border border-[var(--border)] p-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] font-medium">{s.type}</span>
                          <span className="font-medium text-xs">{s.title}</span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{s.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.googleDocUrl && (
                <a
                  href={brief.googleDocUrl as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#3B82F6] hover:underline"
                >
                  <ExternalLink size={12} /> Open full brief in Google Docs
                </a>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  </motion.div>
)}
```

Add the needed icons to imports: `FileText, ChevronDown, Loader2, ExternalLink` from `lucide-react`.

**Step 4: Add brief tab to MeetingDetail**

Update Tab type: add `"brief"` to the union.

Add to TABS array: `{ key: "brief", label: "Brief" }`

Add brief state + fetch (same pattern as analytics fetch in Task 3).

Add tab disabled: `disabled={key === "brief" && !briefData}`

Add to render switch:
```typescript
{tab === "brief" && briefData && (
  <BriefTab key="brief" data={briefData} />
)}
```

The `BriefTab` component is the same content display as the lobby (agenda suggestions, carryover items, sources) but read-only, wrapped in a motion.div.

**Step 5: Build and verify**

Run: `npx next build`
Expected: 0 errors

**Step 6: Commit**

```bash
git add "src/app/(app)/meetings/[meetingId]/page.tsx" src/components/dashboard/MeetingDetail.tsx
git commit -m "feat: add meeting brief to pre-join lobby and meeting detail drawer"
```

---

### Task 5: Meeting Trends Dashboard Widget

**Files:**
- Create: `src/components/dashboard/MeetingTrendsCard.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx` (lines 296-302, insert after ActionItemTracker)

**Step 1: Create MeetingTrendsCard**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Target, CheckCircle2, Lightbulb } from "lucide-react";

interface TrendsData {
  range: string;
  totalMeetings: number;
  avgScore: number;
  totalDecisions: number;
  totalActionItems: number;
  avgDuration: number;
  patterns: { type: string; message: string; severity: string }[];
}

export default function MeetingTrendsCard() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"week" | "month" | "quarter">("month");

  const fetchTrends = useCallback(() => {
    setLoading(true);
    fetch(`/api/meetings/analytics/trends?range=${range}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => { if (res?.data) setData(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { fetchTrends(); }, [fetchTrends]);

  const scoreColor = data ? (data.avgScore >= 70 ? "#22C55E" : data.avgScore >= 40 ? "#F59E0B" : "#EF4444") : "#6B7280";

  return (
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[var(--border-strong)]">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-[#A855F7]" />
          <span className="font-bold text-sm" style={{ fontFamily: "var(--font-heading)" }}>
            Meeting Trends
          </span>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as "week" | "month" | "quarter")}
          className="text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 cursor-pointer"
        >
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
        </select>
      </div>

      <div className="p-4">
        {loading && !data ? (
          <div className="text-center py-4 text-sm text-[var(--text-secondary)]">Loading trends…</div>
        ) : !data || data.totalMeetings === 0 ? (
          <div className="text-center py-4 text-sm text-[var(--text-secondary)]">No meeting data yet</div>
        ) : (
          <div className="space-y-3">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: BarChart3, label: "Meetings", value: data.totalMeetings },
                { icon: TrendingUp, label: "Avg Score", value: data.avgScore, color: scoreColor },
                { icon: Target, label: "Decisions", value: data.totalDecisions },
                { icon: CheckCircle2, label: "Actions", value: data.totalActionItems },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-lg font-black" style={s.color ? { color: s.color } : undefined}>
                    {s.value}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Patterns */}
            {data.patterns.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                {data.patterns.slice(0, 3).map((p, i) => {
                  const dotColor = { info: "#3B82F6", warning: "#F59E0B", critical: "#EF4444" }[p.severity] || "#6B7280";
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: dotColor }} />
                      <span className="text-[var(--text-secondary)]">{p.message}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add to Dashboard**

In `Dashboard.tsx`, import `MeetingTrendsCard` (dynamic import for consistency):
```typescript
const MeetingTrendsCard = dynamic(() => import("./MeetingTrendsCard"), { ssr: false });
```

Insert `<MeetingTrendsCard />` in the right column after ActionItemTracker and before the AI Briefing card (between lines ~302 and ~305).

**Step 3: Build and verify**

Run: `npx next build`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/components/dashboard/MeetingTrendsCard.tsx src/components/dashboard/Dashboard.tsx
git commit -m "feat: add meeting trends dashboard widget"
```

---

### Task 6: Admin Analytics Summary Wiring

**Files:**
- Modify: `src/app/(app)/admin/page.tsx` (lines 153-179 fetch, lines 297-335 stats)

**Step 1: Verify admin page already fetches from `/api/analytics/summary`**

The admin page already calls `fetch("/api/analytics/summary")` at line 153 and renders the response data through `STAT_CARDS` at line ~297. Check whether the current data rendering already covers `overview.totalUsers`, `overview.totalMeetings`, etc.

If the fetch and stat cards already work correctly, add the missing pieces:

**Step 2: Add 7d vs 30d trend comparison**

After the existing stats grid, add a trend comparison section:
```typescript
{data.trends && (
  <div className="grid grid-cols-2 gap-4 mb-8">
    <div className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[4px_4px_0_var(--border-strong)]">
      <div className="text-sm text-[var(--text-secondary)]">Meetings (7 days)</div>
      <div className="text-3xl font-black">{data.trends.meetingsLast7d}</div>
    </div>
    <div className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[4px_4px_0_var(--border-strong)]">
      <div className="text-sm text-[var(--text-secondary)]">Meetings (30 days)</div>
      <div className="text-3xl font-black">{data.trends.meetingsLast30d}</div>
    </div>
  </div>
)}
```

**Step 3: Add event breakdown**

After the trends section:
```typescript
{data.eventBreakdown?.length > 0 && (
  <div className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[4px_4px_0_var(--border-strong)]">
    <h3 className="font-bold mb-3" style={{ fontFamily: "var(--font-heading)" }}>Event Breakdown</h3>
    <div className="space-y-2">
      {data.eventBreakdown.map((e: { type: string; count: number }) => (
        <div key={e.type} className="flex items-center justify-between text-sm">
          <span className="capitalize text-[var(--text-secondary)]">{e.type.replace(/_/g, " ")}</span>
          <span className="font-bold">{e.count}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 4: Build and verify**

Run: `npx next build`
Expected: 0 errors

**Step 5: Commit**

```bash
git add "src/app/(app)/admin/page.tsx"
git commit -m "feat: wire admin page to analytics summary API with trends and event breakdown"
```

---

### Task 7: Workspace Hook

**Files:**
- Create: `src/hooks/useWorkspaces.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

interface WorkspaceMember {
  userId: { _id: string; name: string; email: string; displayName: string };
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

interface Workspace {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: { userId: string; role: string; joinedAt: string }[];
  settings: { autoShutdown: boolean; shutdownAfterMinutes: number };
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  _id: string;
  action: string;
  userName: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workspaces");
      const data = await res.json();
      setWorkspaces(data.workspaces || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || "Failed to create"); }
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const updateWorkspace = useCallback(async (id: string, data: { name?: string; description?: string; settings?: Record<string, unknown> }) => {
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || "Failed to update"); }
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const deleteWorkspace = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || "Failed to delete"); }
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const fetchMembers = useCallback(async (id: string): Promise<WorkspaceMember[]> => {
    const res = await fetch(`/api/workspaces/${id}/members`, { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  }, []);

  const addMember = useCallback(async (id: string, email: string, role: "member" | "admin" = "member") => {
    const res = await fetch(`/api/workspaces/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || "Failed to add member"); }
  }, []);

  const removeMember = useCallback(async (workspaceId: string, memberId: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/members?memberId=${memberId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || "Failed to remove member"); }
  }, []);

  const fetchAuditLogs = useCallback(async (id: string): Promise<AuditLog[]> => {
    const res = await fetch(`/api/workspaces/${id}/audit`, { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.logs || [];
  }, []);

  return {
    workspaces, loading, error,
    createWorkspace, updateWorkspace, deleteWorkspace,
    fetchMembers, addMember, removeMember, fetchAuditLogs,
    refetch: fetchWorkspaces,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useWorkspaces.ts
git commit -m "feat: add useWorkspaces hook for workspace CRUD and member management"
```

---

### Task 8: WorkspaceSection Component

**Files:**
- Create: `src/components/settings/WorkspaceSection.tsx`

**Step 1: Create the component**

Build a settings section that shows workspace list, create form, and expandable detail with members/settings/audit. Use the Yoodle Card styling. The component should use `useWorkspaces()` hook and expose:
- Workspace list with name, role badge, member count
- "Create workspace" button → inline form
- Expandable detail: edit name, members list, add/remove member, auto-shutdown toggle, audit log, delete

Follow the Card pattern from the settings page (`rounded-2xl border-2 border-[var(--border-strong)]`) and use the same motion animation pattern.

Key UI elements:
- Role badges: owner=yellow, admin=purple, member=gray
- Add member: email input + role select + "Add" button
- Delete: red button with "Are you sure?" confirmation
- Audit: collapsible table showing action, user, timestamp

**Step 2: Commit**

```bash
git add src/components/settings/WorkspaceSection.tsx
git commit -m "feat: add WorkspaceSection settings component"
```

---

### Task 9: Wire WorkspaceSection into Settings Page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx` (after Security section ~line 256, before Save button ~line 259)

**Step 1: Import and render**

Add import:
```typescript
import WorkspaceSection from "@/components/settings/WorkspaceSection";
```

Add `Building2` to the lucide-react import.

Insert after the Security card and before the Save button:
```typescript
{/* Workspaces */}
<motion.div variants={item}>
  <WorkspaceSection />
</motion.div>
```

**Step 2: Build and verify**

Run: `npx next build`
Expected: 0 errors

**Step 3: Commit**

```bash
git add "src/app/(app)/settings/page.tsx"
git commit -m "feat: add workspace management section to settings page"
```

---

### Task 10: Final Build + Integration Verification

**Step 1: Full build**

Run: `npx next build`
Expected: 0 errors, all pages compile

**Step 2: Verify all orphaned features are now wired**

Checklist:
- [ ] Meeting Copilot: button in control bar → CopilotPanel with SSE
- [ ] Meeting Analytics: "analytics" tab in MeetingDetail
- [ ] Meeting Brief: collapsible section in pre-join lobby + "brief" tab in MeetingDetail
- [ ] Analytics Trends: MeetingTrendsCard in dashboard right column
- [ ] Admin Analytics: trends + event breakdown in admin page
- [ ] Workspaces: WorkspaceSection in settings with full CRUD

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: integration fixes for orphaned feature wiring"
```

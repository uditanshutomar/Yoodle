# AI Calendar Assist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add progressive AI-powered suggestions (titles, attendees, agenda, reference docs) into the CalendarPage event creation form.

**Architecture:** New `POST /api/ai/calendar-assist` route gathers data via existing tool functions (listEvents, searchContacts, searchFiles, searchBoardTasks) in parallel, then calls Gemini for creative synthesis with reasoning. A `useCalendarAssist` hook manages debounce, abort, and progressive triggers. An `AISuggestionChips` component renders inline suggestions with neo-brutalist styling.

**Tech Stack:** Next.js API route, Gemini (`@google/genai`), Mongoose, Zod, React hooks, AbortController

---

### Task 1: API Route — Zod Schema & Dispatch Skeleton

**Files:**
- Create: `src/app/api/ai/calendar-assist/route.ts`

**Step 1: Create the route file with Zod validation and field dispatch**

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:ai:calendar-assist");

const baseSchema = z.object({
  field: z.enum(["titles", "attendees", "agenda", "references"]),
});

const titlesSchema = z.object({
  field: z.literal("titles"),
  partial: z.string().min(3).max(200),
});

const attendeesSchema = z.object({
  field: z.literal("attendees"),
  title: z.string().min(1).max(200),
  existingAttendees: z.array(z.string()).default([]),
});

const agendaSchema = z.object({
  field: z.literal("agenda"),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).default([]),
});

const referencesSchema = z.object({
  field: z.literal("references"),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).default([]),
  agenda: z.string().default(""),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const body = await req.json();
  const { field } = baseSchema.parse(body);

  switch (field) {
    case "titles": {
      const input = titlesSchema.parse(body);
      return successResponse(await suggestTitles(userId, input));
    }
    case "attendees": {
      const input = attendeesSchema.parse(body);
      return successResponse(await suggestAttendees(userId, input));
    }
    case "agenda": {
      const input = agendaSchema.parse(body);
      return successResponse(await suggestAgenda(userId, input));
    }
    case "references": {
      const input = referencesSchema.parse(body);
      return successResponse(await suggestReferences(userId, input));
    }
    default:
      throw new BadRequestError("Unknown field type.");
  }
});

// Placeholder handlers — implemented in subsequent tasks
async function suggestTitles(userId: string, input: z.infer<typeof titlesSchema>) {
  return { suggestions: [], suggestYoodleRoom: false, yoodleRoomReason: "" };
}

async function suggestAttendees(userId: string, input: z.infer<typeof attendeesSchema>) {
  return { suggestions: [] };
}

async function suggestAgenda(userId: string, input: z.infer<typeof agendaSchema>) {
  return { suggestions: [] };
}

async function suggestReferences(userId: string, input: z.infer<typeof referencesSchema>) {
  return { suggestions: [] };
}
```

**Step 2: Verify build compiles**

Run: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd /Users/uditanshutomar/Desktop/Yoodle && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No NEW errors from this file (pre-existing test errors are OK)

**Step 3: Commit**

```bash
git add src/app/api/ai/calendar-assist/route.ts
git commit -m "feat(ai): add calendar-assist route skeleton with Zod validation"
```

---

### Task 2: Implement `suggestTitles` Handler

**Files:**
- Modify: `src/app/api/ai/calendar-assist/route.ts`

**Step 1: Add imports for data gathering and Gemini**

Add these imports at the top of the file:

```typescript
import { listEvents } from "@/lib/google/calendar";
import { getClient, getModelName } from "@/lib/ai/gemini";
import { geminiBreaker } from "@/lib/infra/circuit-breaker";
import Meeting from "@/lib/infra/db/models/meeting";
import mongoose from "mongoose";
```

**Step 2: Implement suggestTitles**

Replace the placeholder `suggestTitles` with:

```typescript
async function suggestTitles(userId: string, input: z.infer<typeof titlesSchema>) {
  const { partial } = input;

  // Gather context in parallel: recent meetings + Yoodle meetings
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const userOid = new mongoose.Types.ObjectId(userId);

  const [recentEvents, yoodleMeetings] = await Promise.allSettled([
    listEvents(userId, {
      timeMin: thirtyDaysAgo.toISOString(),
      timeMax: now.toISOString(),
      maxResults: 20,
    }),
    Meeting.find({
      $or: [{ hostId: userOid }, { "participants.userId": userOid }],
      createdAt: { $gte: thirtyDaysAgo },
    })
      .select("title code type")
      .limit(20)
      .lean(),
  ]);

  const pastTitles: string[] = [];
  let yoodleRoomCount = 0;
  let totalMeetings = 0;

  if (recentEvents.status === "fulfilled") {
    for (const ev of recentEvents.value) {
      pastTitles.push(ev.title);
      totalMeetings++;
      if (ev.location?.includes("/meetings/yoo-") || ev.description?.includes("/meetings/yoo-")) {
        yoodleRoomCount++;
      }
    }
  }

  if (yoodleMeetings.status === "fulfilled") {
    for (const m of yoodleMeetings.value) {
      if (!pastTitles.includes(m.title)) pastTitles.push(m.title);
      yoodleRoomCount++;
      totalMeetings++;
    }
  }

  // Ask Gemini for title completions
  const ai = getClient();
  const model = getModelName();

  const prompt = `You are a calendar assistant. The user is typing a meeting title and has entered: "${partial}"

Their recent meeting titles (last 30 days):
${pastTitles.length > 0 ? pastTitles.map((t) => `- ${t}`).join("\n") : "- No recent meetings"}

Suggest 3-5 complete meeting titles that start with or relate to "${partial}". For each, provide a short reason (under 15 words) explaining why you suggest it.

Respond ONLY with valid JSON (no markdown, no backticks):
{"titles":[{"value":"Full Title Here","reason":"Short reason here"}]}`;

  try {
    const result = await geminiBreaker.execute(() =>
      ai.models.generateContent({ model, contents: prompt })
    );
    const text = result.text?.trim() || "{}";
    const cleaned = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);

    const suggestions = Array.isArray(parsed.titles)
      ? parsed.titles.slice(0, 5).map((t: { value?: string; reason?: string }) => ({
          value: String(t.value || ""),
          reason: String(t.reason || ""),
        })).filter((t: { value: string }) => t.value.length > 0)
      : [];

    const suggestYoodleRoom = totalMeetings > 0 && yoodleRoomCount / totalMeetings > 0.4;
    const yoodleRoomReason = suggestYoodleRoom
      ? `${yoodleRoomCount} of your last ${totalMeetings} meetings used Yoodle Rooms`
      : "";

    return { suggestions, suggestYoodleRoom, yoodleRoomReason };
  } catch (err) {
    log.error({ err }, "suggestTitles: Gemini call failed");
    return { suggestions: [], suggestYoodleRoom: false, yoodleRoomReason: "" };
  }
}
```

**Step 3: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "calendar-assist"`
Expected: No errors from this file

**Step 4: Commit**

```bash
git add src/app/api/ai/calendar-assist/route.ts
git commit -m "feat(ai): implement suggestTitles with Gemini + past meeting context"
```

---

### Task 3: Implement `suggestAttendees` Handler

**Files:**
- Modify: `src/app/api/ai/calendar-assist/route.ts`

**Step 1: Add contacts and user imports**

```typescript
import { searchContacts } from "@/lib/google/contacts";
import User from "@/lib/infra/db/models/user";
import Board from "@/lib/infra/db/models/board";
```

**Step 2: Implement suggestAttendees**

Replace the placeholder:

```typescript
async function suggestAttendees(userId: string, input: z.infer<typeof attendeesSchema>) {
  const { title, existingAttendees } = input;
  const existingSet = new Set(existingAttendees);
  const userOid = new mongoose.Types.ObjectId(userId);

  // Gather in parallel: contacts matching title keywords, board members, recent meeting attendees
  const keywords = title.split(/\s+/).filter((w) => w.length >= 3).slice(0, 3);
  const contactQuery = keywords.join(" ");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [contactsResult, boardsResult, pastMeetingsResult] = await Promise.allSettled([
    contactQuery ? searchContacts(userId, contactQuery, 10) : Promise.resolve([]),
    Board.find({ "members.userId": userOid })
      .select("members.userId title")
      .lean(),
    Meeting.find({
      $or: [{ hostId: userOid }, { "participants.userId": userOid }],
      createdAt: { $gte: thirtyDaysAgo },
    })
      .select("title participants.userId")
      .limit(20)
      .lean(),
  ]);

  // Collect candidate user IDs with frequency/source
  const candidates = new Map<string, { count: number; sources: string[] }>();

  const addCandidate = (uid: string, source: string) => {
    if (uid === userId || existingSet.has(uid)) return;
    const existing = candidates.get(uid) || { count: 0, sources: [] };
    existing.count++;
    if (!existing.sources.includes(source)) existing.sources.push(source);
    candidates.set(uid, existing);
  };

  if (boardsResult.status === "fulfilled") {
    for (const board of boardsResult.value) {
      for (const member of board.members) {
        addCandidate(member.userId.toString(), `member of ${board.title}`);
      }
    }
  }

  if (pastMeetingsResult.status === "fulfilled") {
    for (const meeting of pastMeetingsResult.value) {
      const titleLower = title.toLowerCase();
      const meetingTitleLower = meeting.title.toLowerCase();
      // Boost if meeting title is similar
      const relevant = keywords.some((kw) => meetingTitleLower.includes(kw.toLowerCase()));
      for (const p of meeting.participants) {
        addCandidate(p.userId.toString(), relevant ? `attended similar "${meeting.title}"` : "recent meeting participant");
      }
    }
  }

  if (candidates.size === 0) return { suggestions: [] };

  // Fetch user profiles for top candidates (sorted by frequency)
  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);
  const candidateIds = sorted.map(([id]) => new mongoose.Types.ObjectId(id));

  const users = await User.find({ _id: { $in: candidateIds } })
    .select("name displayName avatarUrl status mode")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const suggestions = sorted
    .map(([id, meta]) => {
      const user = userMap.get(id);
      if (!user) return null;
      return {
        userId: id,
        name: user.name,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null,
        reason: meta.sources[0] || "Frequent collaborator",
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  return { suggestions };
}
```

**Step 3: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "calendar-assist"`
Expected: No errors

**Step 4: Commit**

```bash
git add src/app/api/ai/calendar-assist/route.ts
git commit -m "feat(ai): implement suggestAttendees from boards, meetings, and contacts"
```

---

### Task 4: Implement `suggestAgenda` Handler

**Files:**
- Modify: `src/app/api/ai/calendar-assist/route.ts`

**Step 1: Add board tools import**

```typescript
import { searchBoardTasks } from "@/lib/board/tools";
```

**Step 2: Implement suggestAgenda**

Replace the placeholder:

```typescript
async function suggestAgenda(userId: string, input: z.infer<typeof agendaSchema>) {
  const { title, attendees } = input;

  // Gather: board tasks matching title keywords + recent meetings with similar titles
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [tasksResult, pastMeetingsResult] = await Promise.allSettled([
    searchBoardTasks(userId, { query: title }),
    Meeting.find({
      $or: [
        { hostId: new mongoose.Types.ObjectId(userId) },
        { "participants.userId": new mongoose.Types.ObjectId(userId) },
      ],
      title: { $regex: title.split(/\s+/)[0], $options: "i" },
      createdAt: { $gte: thirtyDaysAgo },
    })
      .select("title")
      .limit(5)
      .lean(),
  ]);

  const contextParts: string[] = [];

  if (tasksResult.status === "fulfilled" && tasksResult.value.success && Array.isArray(tasksResult.value.data)) {
    const tasks = tasksResult.value.data.slice(0, 8);
    if (tasks.length > 0) {
      contextParts.push(
        "Related board tasks:\n" + tasks.map((t: { title: string; priority?: string; dueDate?: string }) =>
          `- ${t.title}${t.priority ? ` (${t.priority})` : ""}${t.dueDate ? ` due ${t.dueDate}` : ""}`
        ).join("\n")
      );
    }
  }

  if (pastMeetingsResult.status === "fulfilled" && pastMeetingsResult.value.length > 0) {
    contextParts.push(
      "Similar past meetings:\n" + pastMeetingsResult.value.map((m) => `- ${m.title}`).join("\n")
    );
  }

  if (attendees.length > 0) {
    contextParts.push(`Meeting has ${attendees.length} attendee(s).`);
  }

  const ai = getClient();
  const model = getModelName();

  const prompt = `You are a meeting agenda assistant. Generate 3-5 agenda items for a meeting titled "${title}".

Context:
${contextParts.length > 0 ? contextParts.join("\n\n") : "No additional context available."}

For each item, provide the agenda topic and a short reason (under 15 words) explaining why it's relevant.

Respond ONLY with valid JSON (no markdown, no backticks):
{"items":[{"value":"Agenda item text","reason":"Short reason"}]}`;

  try {
    const result = await geminiBreaker.execute(() =>
      ai.models.generateContent({ model, contents: prompt })
    );
    const text = result.text?.trim() || "{}";
    const cleaned = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);

    const suggestions = Array.isArray(parsed.items)
      ? parsed.items.slice(0, 5).map((item: { value?: string; reason?: string }) => ({
          value: String(item.value || ""),
          reason: String(item.reason || ""),
        })).filter((item: { value: string }) => item.value.length > 0)
      : [];

    return { suggestions };
  } catch (err) {
    log.error({ err }, "suggestAgenda: Gemini call failed");
    return { suggestions: [] };
  }
}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "calendar-assist"`

**Step 4: Commit**

```bash
git add src/app/api/ai/calendar-assist/route.ts
git commit -m "feat(ai): implement suggestAgenda with board tasks and Gemini"
```

---

### Task 5: Implement `suggestReferences` Handler

**Files:**
- Modify: `src/app/api/ai/calendar-assist/route.ts`

**Step 1: Add drive import**

```typescript
import { searchFiles } from "@/lib/google/drive";
```

**Step 2: Implement suggestReferences**

Replace the placeholder:

```typescript
async function suggestReferences(userId: string, input: z.infer<typeof referencesSchema>) {
  const { title, agenda } = input;

  // Build search query from title + agenda keywords
  const searchTerms = [title, ...agenda.split("\n").slice(0, 3)]
    .join(" ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 5)
    .join(" ");

  if (!searchTerms) return { suggestions: [] };

  try {
    const files = await searchFiles(userId, searchTerms, 8);

    if (!files || files.length === 0) return { suggestions: [] };

    // Use Gemini to rank relevance and add reasoning
    const ai = getClient();
    const model = getModelName();

    const fileList = files.map((f: { name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }, i: number) =>
      `${i + 1}. "${f.name}" (${f.mimeType}, modified: ${f.modifiedTime || "unknown"})`
    ).join("\n");

    const prompt = `You are a meeting preparation assistant. A user is scheduling a meeting titled "${title}" with this agenda: "${agenda || "not set yet"}".

These Google Drive files were found:
${fileList}

Pick the top 3-5 most relevant files for this meeting. For each, provide the file number and a short reason (under 15 words) for why it's relevant.

Respond ONLY with valid JSON (no markdown, no backticks):
{"picks":[{"index":1,"reason":"Short reason"}]}`;

    const result = await geminiBreaker.execute(() =>
      ai.models.generateContent({ model, contents: prompt })
    );
    const text = result.text?.trim() || "{}";
    const cleaned = text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);

    const suggestions = Array.isArray(parsed.picks)
      ? parsed.picks
          .slice(0, 5)
          .map((pick: { index?: number; reason?: string }) => {
            const idx = (pick.index || 0) - 1;
            const file = files[idx];
            if (!file) return null;
            const mimeToType: Record<string, string> = {
              "application/vnd.google-apps.document": "doc",
              "application/vnd.google-apps.spreadsheet": "sheet",
              "application/vnd.google-apps.presentation": "slide",
              "application/pdf": "pdf",
            };
            return {
              title: file.name,
              url: file.webViewLink || "",
              type: mimeToType[file.mimeType] || "file",
              reason: String(pick.reason || ""),
            };
          })
          .filter(Boolean)
      : [];

    return { suggestions };
  } catch (err) {
    log.error({ err }, "suggestReferences: failed");
    return { suggestions: [] };
  }
}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "calendar-assist"`

**Step 4: Commit**

```bash
git add src/app/api/ai/calendar-assist/route.ts
git commit -m "feat(ai): implement suggestReferences with Drive search and Gemini ranking"
```

---

### Task 6: Create `useCalendarAssist` Hook

**Files:**
- Create: `src/components/calendar/useCalendarAssist.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useState, useRef, useCallback } from "react";

export interface TitleSuggestion {
  value: string;
  reason: string;
}

export interface AttendeeSuggestion {
  userId: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  reason: string;
}

export interface AgendaSuggestion {
  value: string;
  reason: string;
}

export interface ReferenceSuggestion {
  title: string;
  url: string;
  type: string;
  reason: string;
}

interface CalendarAssistState {
  titles: TitleSuggestion[];
  attendees: AttendeeSuggestion[];
  agenda: AgendaSuggestion[];
  references: ReferenceSuggestion[];
  suggestYoodleRoom: boolean;
  yoodleRoomReason: string;
  loading: {
    titles: boolean;
    attendees: boolean;
    agenda: boolean;
    references: boolean;
  };
  rateLimited: boolean;
}

const INITIAL_STATE: CalendarAssistState = {
  titles: [],
  attendees: [],
  agenda: [],
  references: [],
  suggestYoodleRoom: false,
  yoodleRoomReason: "",
  loading: { titles: false, attendees: false, agenda: false, references: false },
  rateLimited: false,
};

const DEBOUNCE_MS = 800;
const TIMEOUT_MS = 10_000;

async function fetchAssist(
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/ai/calendar-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (res.status === 429) return null; // rate limited
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export function useCalendarAssist() {
  const [state, setState] = useState<CalendarAssistState>(INITIAL_STATE);
  const abortRefs = useRef<Record<string, AbortController>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitedRef = useRef(false);

  const cancelField = useCallback((field: string) => {
    abortRefs.current[field]?.abort();
    delete abortRefs.current[field];
  }, []);

  const setLoading = useCallback((field: keyof CalendarAssistState["loading"], val: boolean) => {
    setState((prev) => ({ ...prev, loading: { ...prev.loading, [field]: val } }));
  }, []);

  // ── Title suggestions (debounced) ──
  const fetchTitleSuggestions = useCallback((partial: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (rateLimitedRef.current || partial.length < 3) {
      setState((prev) => ({ ...prev, titles: [] }));
      return;
    }

    debounceRef.current = setTimeout(async () => {
      cancelField("titles");
      const controller = new AbortController();
      abortRefs.current.titles = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("titles", true);

      const data = await fetchAssist({ field: "titles", partial }, controller.signal);
      clearTimeout(timeout);
      setLoading("titles", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          titles: (data.suggestions as TitleSuggestion[]) || [],
          suggestYoodleRoom: (data.suggestYoodleRoom as boolean) || false,
          yoodleRoomReason: (data.yoodleRoomReason as string) || "",
        }));
      }
    }, DEBOUNCE_MS);
  }, [cancelField, setLoading]);

  // ── Attendee suggestions (instant trigger) ──
  const fetchAttendeeSuggestions = useCallback(
    async (title: string, existingAttendees: string[]) => {
      if (rateLimitedRef.current || !title.trim()) return;
      cancelField("attendees");
      const controller = new AbortController();
      abortRefs.current.attendees = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("attendees", true);

      const data = await fetchAssist(
        { field: "attendees", title, existingAttendees },
        controller.signal
      );
      clearTimeout(timeout);
      setLoading("attendees", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          attendees: (data.suggestions as AttendeeSuggestion[]) || [],
        }));
      }
    },
    [cancelField, setLoading]
  );

  // ── Agenda suggestions (instant trigger) ──
  const fetchAgendaSuggestions = useCallback(
    async (title: string, attendees: string[]) => {
      if (rateLimitedRef.current || !title.trim()) return;
      cancelField("agenda");
      const controller = new AbortController();
      abortRefs.current.agenda = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("agenda", true);

      const data = await fetchAssist(
        { field: "agenda", title, attendees },
        controller.signal
      );
      clearTimeout(timeout);
      setLoading("agenda", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          agenda: (data.suggestions as AgendaSuggestion[]) || [],
        }));
      }
    },
    [cancelField, setLoading]
  );

  // ── Reference suggestions (instant trigger) ──
  const fetchReferenceSuggestions = useCallback(
    async (title: string, attendees: string[], agenda: string) => {
      if (rateLimitedRef.current || !title.trim()) return;
      cancelField("references");
      const controller = new AbortController();
      abortRefs.current.references = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("references", true);

      const data = await fetchAssist(
        { field: "references", title, attendees, agenda },
        controller.signal
      );
      clearTimeout(timeout);
      setLoading("references", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          references: (data.suggestions as ReferenceSuggestion[]) || [],
        }));
      }
    },
    [cancelField, setLoading]
  );

  // ── Dismiss helpers ──
  const dismissTitle = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      titles: prev.titles.filter((_, i) => i !== index),
    }));
  }, []);

  const dismissAttendee = useCallback((userId: string) => {
    setState((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a.userId !== userId),
    }));
  }, []);

  const dismissAgenda = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      agenda: prev.agenda.filter((_, i) => i !== index),
    }));
  }, []);

  const dismissReference = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      references: prev.references.filter((_, i) => i !== index),
    }));
  }, []);

  const dismissAllForField = useCallback((field: "titles" | "attendees" | "agenda" | "references") => {
    setState((prev) => ({ ...prev, [field]: [] }));
  }, []);

  // ── Clear downstream when upstream changes ──
  const clearDownstream = useCallback((from: "title" | "attendees" | "agenda") => {
    if (from === "title") {
      cancelField("attendees");
      cancelField("agenda");
      cancelField("references");
      setState((prev) => ({ ...prev, attendees: [], agenda: [], references: [] }));
    } else if (from === "attendees") {
      cancelField("agenda");
      cancelField("references");
      setState((prev) => ({ ...prev, agenda: [], references: [] }));
    } else if (from === "agenda") {
      cancelField("references");
      setState((prev) => ({ ...prev, references: [] }));
    }
  }, [cancelField]);

  // ── Reset all ──
  const reset = useCallback(() => {
    Object.values(abortRefs.current).forEach((c) => c.abort());
    abortRefs.current = {};
    if (debounceRef.current) clearTimeout(debounceRef.current);
    rateLimitedRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    fetchTitleSuggestions,
    fetchAttendeeSuggestions,
    fetchAgendaSuggestions,
    fetchReferenceSuggestions,
    dismissTitle,
    dismissAttendee,
    dismissAgenda,
    dismissReference,
    dismissAllForField,
    clearDownstream,
    reset,
  };
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "useCalendarAssist"`

**Step 3: Commit**

```bash
git add src/components/calendar/useCalendarAssist.ts
git commit -m "feat(calendar): add useCalendarAssist hook with debounce, abort, and progressive triggers"
```

---

### Task 7: Create `AISuggestionChips` Component

**Files:**
- Create: `src/components/calendar/AISuggestionChips.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { Sparkles, X, User, FileText, File, Sheet, Presentation } from "lucide-react";

interface BaseSuggestion {
  reason: string;
}

export interface ChipSuggestion extends BaseSuggestion {
  label: string;
  sublabel?: string;
  avatarUrl?: string | null;
  icon?: "user" | "doc" | "sheet" | "slide" | "pdf" | "file" | "agenda";
}

interface AISuggestionChipsProps {
  suggestions: ChipSuggestion[];
  loading: boolean;
  onAccept: (index: number) => void;
  onDismiss: (index: number) => void;
  onDismissAll: () => void;
  label?: string;
}

const iconMap = {
  user: User,
  doc: FileText,
  sheet: Sheet,
  slide: Presentation,
  pdf: File,
  file: File,
  agenda: FileText,
};

function SkeletonChip() {
  return (
    <div className="animate-pulse flex items-center gap-2 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-3 py-2 h-14 w-48" />
  );
}

export function AISuggestionChips({
  suggestions,
  loading,
  onAccept,
  onDismiss,
  onDismissAll,
  label = "AI Suggestions",
}: AISuggestionChipsProps) {
  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="mt-2 rounded-2xl border-2 border-neutral-900 bg-[#FFFEF5] p-3 shadow-[3px_3px_0_0_#FFE600]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
          <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
          {label}
        </div>
        {suggestions.length > 1 && (
          <button
            type="button"
            onClick={onDismissAll}
            className="text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Dismiss all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {loading && suggestions.length === 0 && (
          <>
            <SkeletonChip />
            <SkeletonChip />
            <SkeletonChip />
          </>
        )}

        {suggestions.map((s, i) => {
          const Icon = s.icon ? iconMap[s.icon] : null;
          return (
            <button
              key={`${s.label}-${i}`}
              type="button"
              onClick={() => onAccept(i)}
              className="group relative flex items-center gap-2 rounded-xl border-2 border-neutral-900 bg-white px-3 py-1.5 text-left transition-all hover:bg-[#FFE600] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {s.avatarUrl ? (
                <img
                  src={s.avatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-full border border-neutral-300 object-cover"
                />
              ) : Icon ? (
                <Icon className="h-4 w-4 text-neutral-500 flex-shrink-0" />
              ) : null}

              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-900 truncate max-w-[180px]">
                  {s.label}
                </div>
                <div className="text-[10px] text-neutral-500 truncate max-w-[180px]">
                  {s.reason}
                </div>
              </div>

              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(i);
                }}
                className="ml-1 flex-shrink-0 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "AISuggestionChips"`

**Step 3: Commit**

```bash
git add src/components/calendar/AISuggestionChips.tsx
git commit -m "feat(calendar): add AISuggestionChips component with neo-brutalist styling"
```

---

### Task 8: Wire `useCalendarAssist` into `CalendarPage.tsx` — Title Suggestions

**Files:**
- Modify: `src/components/calendar/CalendarPage.tsx`

**Step 1: Add imports**

At the top of CalendarPage.tsx, add:

```typescript
import { useCalendarAssist } from "./useCalendarAssist";
import { AISuggestionChips, ChipSuggestion } from "./AISuggestionChips";
```

**Step 2: Initialize the hook inside CreateEventModal**

Inside the `CreateEventModal` component, after the existing state declarations, add:

```typescript
const assist = useCalendarAssist();
```

Also add a `useEffect` to reset when modal closes:

```typescript
useEffect(() => {
  if (!open) assist.reset();
}, [open]);
```

**Step 3: Wire title input to fetchTitleSuggestions**

Find the title `<input>` field's `onChange` handler. Modify it to also call assist:

```typescript
onChange={(e) => {
  const val = e.target.value;
  setForm((prev) => ({ ...prev, title: val }));
  assist.clearDownstream("title");
  assist.fetchTitleSuggestions(val);
}}
```

**Step 4: Render title suggestion dropdown below the title input**

After the title `<input>` element, add:

```typescript
{(assist.titles.length > 0 || assist.loading.titles) && (
  <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border-2 border-neutral-900 bg-white shadow-[3px_3px_0_0_#FFE600] overflow-hidden">
    {assist.loading.titles && assist.titles.length === 0 && (
      <div className="px-3 py-2 text-xs text-neutral-400 animate-pulse">
        <Sparkles className="inline h-3 w-3 mr-1" />
        Thinking...
      </div>
    )}
    {assist.titles.map((t, i) => (
      <button
        key={i}
        type="button"
        onClick={() => {
          setForm((prev) => ({ ...prev, title: t.value }));
          assist.dismissAllForField("titles");
          // Trigger attendee suggestions after title selection
          const existingIds = form.attendees
            .filter((a) => a.userId)
            .map((a) => a.userId!);
          assist.fetchAttendeeSuggestions(t.value, existingIds);
        }}
        className="w-full text-left px-3 py-2 hover:bg-[#FFE600] transition-colors border-b last:border-b-0 border-neutral-100"
      >
        <div className="text-sm font-medium text-neutral-900">{t.value}</div>
        <div className="text-[10px] text-neutral-500">{t.reason}</div>
      </button>
    ))}
  </div>
)}
```

**Note:** Wrap the title input in a `<div className="relative">` container for proper absolute positioning of the dropdown.

**Step 5: Auto-toggle Yoodle Room switch**

Add a `useEffect` that reacts to `assist.suggestYoodleRoom`:

```typescript
useEffect(() => {
  if (assist.suggestYoodleRoom && !form.createYoodleRoom) {
    setForm((prev) => ({ ...prev, createYoodleRoom: true }));
  }
}, [assist.suggestYoodleRoom]);
```

**Step 6: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "CalendarPage"`

**Step 7: Commit**

```bash
git add src/components/calendar/CalendarPage.tsx
git commit -m "feat(calendar): wire title AI suggestions into CreateEventModal"
```

---

### Task 9: Wire Attendee, Agenda, and Reference Suggestions into CalendarPage

**Files:**
- Modify: `src/components/calendar/CalendarPage.tsx`

**Step 1: Trigger attendee fetch when title is confirmed (blur or Enter)**

Add `onBlur` to the title input:

```typescript
onBlur={() => {
  if (form.title.trim().length >= 3) {
    const existingIds = form.attendees
      .filter((a) => a.userId)
      .map((a) => a.userId!);
    assist.fetchAttendeeSuggestions(form.title, existingIds);
  }
}}
```

**Step 2: Render attendee suggestion chips below AttendeeInput**

After the `<AttendeeInput>` component, add:

```typescript
<AISuggestionChips
  suggestions={assist.attendees.map((a) => ({
    label: a.displayName || a.name,
    sublabel: a.name,
    avatarUrl: a.avatarUrl,
    icon: "user" as const,
    reason: a.reason,
  }))}
  loading={assist.loading.attendees}
  onAccept={(i) => {
    const suggestion = assist.attendees[i];
    if (!suggestion) return;
    // Add to form attendees
    setForm((prev) => ({
      ...prev,
      attendees: [
        ...prev.attendees,
        {
          type: "user" as const,
          userId: suggestion.userId,
          name: suggestion.displayName || suggestion.name,
          avatarUrl: suggestion.avatarUrl,
        },
      ],
    }));
    assist.dismissAttendee(suggestion.userId);
    // Trigger agenda fetch
    const updatedAttendeeIds = [
      ...form.attendees.filter((a) => a.userId).map((a) => a.userId!),
      suggestion.userId,
    ];
    assist.fetchAgendaSuggestions(form.title, updatedAttendeeIds);
  }}
  onDismiss={(i) => assist.dismissAttendee(assist.attendees[i]?.userId || "")}
  onDismissAll={() => assist.dismissAllForField("attendees")}
  label="Suggested Attendees"
/>
```

**Step 3: Trigger agenda fetch when attendees change**

Add a `useEffect` that watches form.attendees:

```typescript
const prevAttendeeCount = useRef(0);

useEffect(() => {
  if (form.attendees.length > 0 && form.attendees.length !== prevAttendeeCount.current && form.title.trim().length >= 3) {
    prevAttendeeCount.current = form.attendees.length;
    const attendeeIds = form.attendees.filter((a) => a.userId).map((a) => a.userId!);
    assist.clearDownstream("attendees");
    assist.fetchAgendaSuggestions(form.title, attendeeIds);
  }
}, [form.attendees.length]);
```

**Step 4: Render agenda suggestion chips below the agenda textarea**

After the agenda `<textarea>`, add:

```typescript
<AISuggestionChips
  suggestions={assist.agenda.map((a) => ({
    label: a.value,
    icon: "agenda" as const,
    reason: a.reason,
  }))}
  loading={assist.loading.agenda}
  onAccept={(i) => {
    const item = assist.agenda[i];
    if (!item) return;
    setForm((prev) => ({
      ...prev,
      agenda: prev.agenda ? `${prev.agenda}\n• ${item.value}` : `• ${item.value}`,
    }));
    assist.dismissAgenda(i);
    // Trigger references after agenda item added
    const attendeeIds = form.attendees.filter((a) => a.userId).map((a) => a.userId!);
    assist.fetchReferenceSuggestions(form.title, attendeeIds, form.agenda);
  }}
  onDismiss={(i) => assist.dismissAgenda(i)}
  onDismissAll={() => assist.dismissAllForField("agenda")}
  label="Suggested Agenda Items"
/>
```

**Step 5: Render reference suggestion chips below the reference links textarea**

After the reference links `<textarea>`, add:

```typescript
<AISuggestionChips
  suggestions={assist.references.map((r) => ({
    label: r.title,
    icon: r.type as "doc" | "sheet" | "slide" | "pdf" | "file",
    reason: r.reason,
  }))}
  loading={assist.loading.references}
  onAccept={(i) => {
    const ref = assist.references[i];
    if (!ref) return;
    setForm((prev) => ({
      ...prev,
      referenceLinks: prev.referenceLinks
        ? `${prev.referenceLinks}\n${ref.url}`
        : ref.url,
    }));
    assist.dismissReference(i);
  }}
  onDismiss={(i) => assist.dismissReference(i)}
  onDismissAll={() => assist.dismissAllForField("references")}
  label="Suggested Documents"
/>
```

**Step 6: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "CalendarPage"`

**Step 7: Commit**

```bash
git add src/components/calendar/CalendarPage.tsx
git commit -m "feat(calendar): wire attendee, agenda, and reference AI suggestions into form"
```

---

### Task 10: Add Yoodle Room Reason Tooltip

**Files:**
- Modify: `src/components/calendar/CalendarPage.tsx`

**Step 1: Add tooltip next to the Yoodle Room toggle**

Find the "Create Yoodle Room" toggle/switch in the form. Add the AI reasoning next to it:

```typescript
{assist.yoodleRoomReason && (
  <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
    <Sparkles className="h-2.5 w-2.5" />
    {assist.yoodleRoomReason}
  </span>
)}
```

**Step 2: Commit**

```bash
git add src/components/calendar/CalendarPage.tsx
git commit -m "feat(calendar): add AI reasoning tooltip for Yoodle Room suggestion"
```

---

### Task 11: API Route Tests

**Files:**
- Create: `src/app/api/ai/calendar-assist/__tests__/route.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));
vi.mock("@/lib/google/calendar", () => ({
  listEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/google/contacts", () => ({
  searchContacts: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/google/drive", () => ({
  searchFiles: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/board/tools", () => ({
  searchBoardTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock("@/lib/infra/circuit-breaker", () => ({
  geminiBreaker: {
    execute: vi.fn((fn: () => Promise<unknown>) => fn()),
  },
}));
vi.mock("@/lib/ai/gemini", () => ({
  getClient: vi.fn(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"titles":[{"value":"Sprint Planning Review","reason":"Based on recent meetings"}]}',
      }),
    },
  })),
  getModelName: vi.fn(() => "gemini-3.1-pro-preview"),
}));
vi.mock("@/lib/infra/db/models/meeting", () => {
  const find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/user", () => {
  const find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/board", () => {
  const find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: { find } };
});

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai/calendar-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/ai/calendar-assist", () => {
  it("returns title suggestions for valid partial", async () => {
    const res = await POST(makeRequest({ field: "titles", partial: "Sprint Pl" }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toBeDefined();
    expect(Array.isArray(json.data.suggestions)).toBe(true);
  });

  it("rejects partial shorter than 3 chars", async () => {
    const res = await POST(makeRequest({ field: "titles", partial: "Sp" }));
    const json = await res.json();
    expect(res.status).toBe(400);
  });

  it("returns attendee suggestions", async () => {
    const res = await POST(makeRequest({
      field: "attendees",
      title: "Sprint Planning",
      existingAttendees: [],
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toBeDefined();
  });

  it("returns agenda suggestions", async () => {
    const res = await POST(makeRequest({
      field: "agenda",
      title: "Sprint Planning",
      attendees: [],
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toBeDefined();
  });

  it("returns reference suggestions", async () => {
    const res = await POST(makeRequest({
      field: "references",
      title: "Sprint Planning",
      attendees: [],
      agenda: "Review tasks",
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.suggestions).toBeDefined();
  });

  it("rejects unknown field", async () => {
    const res = await POST(makeRequest({ field: "unknown" }));
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run tests**

Run: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd /Users/uditanshutomar/Desktop/Yoodle && npx vitest run src/app/api/ai/calendar-assist/__tests__/route.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/app/api/ai/calendar-assist/__tests__/route.test.ts
git commit -m "test(ai): add calendar-assist route tests"
```

---

### Task 12: Final Integration Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (908+ tests)

**Step 2: Verify TypeScript build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address any integration issues from AI calendar assist"
```

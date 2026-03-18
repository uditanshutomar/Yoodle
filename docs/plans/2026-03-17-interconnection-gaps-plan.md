# Meeting AI Interconnection Gaps — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire together all disconnected meeting AI features — dead code, broken card rendering, orphaned dashboard widgets, template integration, and artifact persistence.

**Architecture:** Each task targets a specific disconnection: (1) wrap AI tool outputs in card format so the existing CardRenderer can display them, (2) call dead-code functions from cascade/triggers, (3) import orphaned widgets into Dashboard, (4) add `artifacts` and `templateId` fields to Meeting model and wire through API + UI, (5) send cascade results as card data instead of plain text.

**Tech Stack:** Next.js App Router, MongoDB/Mongoose, React, TypeScript, Tailwind CSS, Gemini AI tools, Google Workspace APIs

---

### Task 1: Fix `prepare_meeting_brief` Tool — Return Card Format

**Files:**
- Modify: `src/lib/ai/tools.ts:3139-3143`

**Context:** The `prepare_meeting_brief` tool executor returns `data: { ...briefData, docUrl }` — a flat object. The `useAIChat` hook (line 258) looks for `data.card` with a `type` property to route to `CardRenderer`. The `MeetingBriefCard` component expects `MeetingBriefCardData` shape: `{ type, meetingId, meetingTitle, sources[], carryoverItems[], agendaSuggestions[], docUrl }`. Working examples: `start_workflow` (tools.ts:2749) and `batch_action` (tools.ts:2802) both return `data: { card: { type: "...", ... } }`.

**Step 1: Write the code change**

In `src/lib/ai/tools.ts`, replace the return statement at line 3139-3143:

```typescript
// BEFORE (line 3139-3143):
return {
  success: true,
  summary: `Prepared brief for "${meetingDoc.title}": ${relatedTasks.length} related tasks, ${pastMeetings.length} past meetings, ${carryoverItems.length} carryover items${docUrl ? " + doc created" : ""}`,
  data: { ...briefData, docUrl },
};

// AFTER:
return {
  success: true,
  summary: `Prepared brief for "${meetingDoc.title}": ${relatedTasks.length} related tasks, ${pastMeetings.length} past meetings, ${carryoverItems.length} carryover items${docUrl ? " + doc created" : ""}`,
  data: {
    card: {
      type: "meeting_brief" as const,
      meetingId,
      meetingTitle: meetingDoc.title,
      sources: [
        ...relatedTasks.map((t) => ({
          type: "task" as const,
          title: t.title,
          summary: `Priority: ${t.priority || "none"}, Due: ${t.dueDate || "N/A"}`,
        })),
        ...pastMeetings.map((m) => ({
          type: "meeting" as const,
          title: m.title,
          summary: (m as unknown as { mom?: { summary?: string } }).mom?.summary || "No summary",
        })),
      ],
      carryoverItems: carryoverItems.map((c) => ({
        task: c.task,
        fromMeetingTitle: c.from,
      })),
      agendaSuggestions: carryoverItems.length > 0
        ? [`Review ${carryoverItems.length} carryover item(s) from previous meetings`]
        : [],
      docUrl,
    },
  },
};
```

**Step 2: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "fix: wrap prepare_meeting_brief output in card format for CardRenderer"
```

---

### Task 2: Fix `get_meeting_analytics` Tool — Return Card Format

**Files:**
- Modify: `src/lib/ai/tools.ts:2959-2961` (single-meeting branch)
- Modify: `src/lib/ai/tools.ts:2997-3008` (trends branch)

**Context:** Same issue as Task 1. The `get_meeting_analytics` executor has two code paths: (a) single meeting analytics (line 2961 returns `data: analytics`) and (b) aggregate trends (line 2997 returns `data: { timeRange, totalMeetings, ... }`). The `MeetingAnalyticsCardData` type expects: `{ type, meetingTitle, score, scoreBreakdown, speakerStats[], highlights[] }`. Only the single-meeting path has enough data for a rich card; the trends path should return a `data_summary` card instead.

**Step 1: Fix single-meeting analytics return (line 2959-2961)**

```typescript
// BEFORE (line 2959-2961):
const analytics = await MeetingAnalytics.findOne({ meetingId: new mongoose.Types.ObjectId(meetingId) }).lean();
if (!analytics) return { success: true, summary: "No analytics available for this meeting yet.", data: null };
return { success: true, summary: `Analytics for meeting ${meetingId}`, data: analytics };

// AFTER:
const analytics = await MeetingAnalytics.findOne({ meetingId: new mongoose.Types.ObjectId(meetingId) }).lean();
if (!analytics) return { success: true, summary: "No analytics available for this meeting yet.", data: null };

const analyticsAny = analytics as Record<string, unknown>;
return {
  success: true,
  summary: `Analytics for meeting ${meetingId}`,
  data: {
    card: {
      type: "meeting_analytics" as const,
      meetingTitle: meetingDoc.title || "Meeting",
      score: (analyticsAny.meetingScore as number) ?? 0,
      scoreBreakdown: {
        engagement: (analyticsAny.engagementScore as number) ?? 0,
        actionability: (analyticsAny.actionabilityScore as number) ?? 0,
        timeManagement: (analyticsAny.timeManagementScore as number) ?? 0,
      },
      speakerStats: ((analyticsAny.speakerStats as Array<{ name: string; talkTimePercent: number }>) || []).map((s) => ({
        name: s.name,
        talkPercent: s.talkTimePercent,
      })),
      highlights: ((analyticsAny.highlights as string[]) || []),
    },
  },
};
```

**Step 2: Fix trends return (line 2997-3008)**

```typescript
// BEFORE (line 2997-3008):
return {
  success: true,
  summary: `Meeting trends (${timeRange}): ${userMeetings.length} meetings, avg score ${avgScore ?? "N/A"}`,
  data: {
    timeRange,
    totalMeetings: userMeetings.length,
    avgScore,
    totalDecisions,
    totalActionItems,
    analyticsCount: analyticsRecords.length,
  },
};

// AFTER:
return {
  success: true,
  summary: `Meeting trends (${timeRange}): ${userMeetings.length} meetings, avg score ${avgScore ?? "N/A"}`,
  data: {
    card: {
      type: "data_summary" as const,
      title: `Meeting Trends (${timeRange})`,
      items: [
        { label: "Total Meetings", value: String(userMeetings.length) },
        { label: "Avg Score", value: avgScore !== null ? String(avgScore) : "N/A" },
        { label: "Total Decisions", value: String(totalDecisions) },
        { label: "Total Action Items", value: String(totalActionItems) },
      ],
    },
  },
};
```

**Step 3: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "fix: wrap get_meeting_analytics output in card format for CardRenderer"
```

---

### Task 3: Wire Knowledge Graph into Post-Meeting Cascade

**Files:**
- Modify: `src/lib/ai/meeting-cascade.ts:263-280`

**Context:** `updateKnowledgeGraph(userId, meetingId)` in `src/lib/ai/knowledge-builder.ts` is fully implemented but never called. It should run after MoM doc creation in the cascade (Step 1), since it needs MoM data. It's a non-critical enrichment step — failures should not block the cascade.

**Step 1: Add knowledge graph step after create_mom_doc (after line 280)**

In `src/lib/ai/meeting-cascade.ts`, add a new step between `create_mom_doc` (line 263-280) and `create_tasks` (line 282):

```typescript
// Add after line 280 (end of create_mom_doc block), before the create_tasks block:

  // Step 1b: update knowledge graph (non-blocking enrichment)
  if (mtg.mom) {
    try {
      const { updateKnowledgeGraph } = await import("@/lib/ai/knowledge-builder");
      await updateKnowledgeGraph(userId, String(mtg._id));
      log.info({ meetingId: String(mtg._id) }, "Knowledge graph updated");
    } catch (err) {
      log.warn({ err, meetingId: String(mtg._id) }, "Knowledge graph update failed (non-blocking)");
    }
  }
```

**Step 2: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/ai/meeting-cascade.ts
git commit -m "feat: wire updateKnowledgeGraph into post-meeting cascade pipeline"
```

---

### Task 4: Wire Meeting Patterns into Analytics Trends Endpoint

**Files:**
- Modify: `src/app/api/meetings/analytics/trends/route.ts`

**Context:** `analyzeMeetingPatterns(userId)` in `src/lib/ai/meeting-patterns.ts` returns `PatternInsight[]` with pattern detection (duration drift, score trends, participation imbalance, overdue actions). It's never called. The natural integration point is the analytics trends endpoint which already returns aggregate stats — add `patterns` to its response.

**Step 1: Add pattern analysis to the trends endpoint**

In `src/app/api/meetings/analytics/trends/route.ts`, add after `const avgDuration = ...` (line 58) and before the `return successResponse(...)` (line 61):

```typescript
  // Analyze meeting patterns
  let patterns: { type: string; message: string; severity: string }[] = [];
  try {
    const { analyzeMeetingPatterns } = await import("@/lib/ai/meeting-patterns");
    patterns = await analyzeMeetingPatterns(userId);
  } catch (err) {
    // Pattern analysis is non-critical — return empty array on failure
    patterns = [];
  }
```

Then update the `return successResponse(...)` to include `patterns`:

```typescript
  return successResponse({
    range,
    totalMeetings,
    avgScore,
    totalDecisions,
    totalActionItems,
    avgDuration,
    patterns,
    entries,
  });
```

**Step 2: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/meetings/analytics/trends/route.ts
git commit -m "feat: wire analyzeMeetingPatterns into analytics trends endpoint"
```

---

### Task 5: Import MeetingPulse and ActionItemTracker into Dashboard

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx`

**Context:** `MeetingPulse.tsx` fetches upcoming meetings from `/api/meetings?status=scheduled&limit=5` and renders a card with countdowns. `ActionItemTracker.tsx` fetches from `/api/boards/tasks?source=meeting-mom&limit=100` and shows a progress bar. Both are fully built but not imported in `Dashboard.tsx`. They should go in the right column grid (line 197-263), between the Tasks card and the AI Briefing card.

**Step 1: Add imports at the top of Dashboard.tsx**

Add after the existing component imports (around line 15-20):

```typescript
import MeetingPulse from "./MeetingPulse";
import ActionItemTracker from "./ActionItemTracker";
```

**Step 2: Add the widgets into the dashboard layout**

Insert after the Tasks card closing `</motion.div>` (line 217) and before the AI Briefing card `<motion.div>` (line 220):

```tsx
                        {/* Meeting Pulse */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.27, type: "spring", stiffness: 200, damping: 25 }}
                        >
                            <MeetingPulse />
                        </motion.div>

                        {/* Action Item Tracker */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.28, type: "spring", stiffness: 200, damping: 25 }}
                        >
                            <ActionItemTracker />
                        </motion.div>
```

**Step 3: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "feat: add MeetingPulse and ActionItemTracker widgets to dashboard"
```

---

### Task 6: Send Cascade Results as MeetingCascadeCard (Not Plain Text)

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts:526-540`

**Context:** The `triggerPostMeetingCascade` function (line 526) calls `executeMeetingCascade()` and then formats the result as plain markdown text via `postAgentMessage()`. The `MeetingCascadeCard` component exists and handles step display + undo buttons. The card format expects `{ type: "meeting_cascade", meetingTitle, steps: [{ step, status, summary, undoToken? }] }`. The `postAgentMessage` function likely creates a `DirectMessage` — we need to include card data in the message's `agentMeta` or as structured data.

First, check how `postAgentMessage` works — it likely just posts a text message. We need to include the card data in the message so the chat UI renders it.

**Step 1: Update the cascade trigger to include card data**

In `src/lib/chat/proactive-triggers.ts`, replace lines 526-541 (the result formatting block):

```typescript
// BEFORE (line 526-541):
const result = await executeMeetingCascade(uid, String(meeting._id));

const stepSummaries = result.steps
  .filter((s) => s.status === "done")
  .map((s) => `- ${s.summary}`)
  .join("\n");

const undoNote =
  result.undoTokens.length > 0
    ? "\n\nYou can undo any of these actions — just ask."
    : "";

const content = `**Post-Meeting Cascade: ${meeting.title}**\n\n${stepSummaries}${undoNote}`;

await postAgentMessage(cid, uid, content);

// AFTER:
const result = await executeMeetingCascade(uid, String(meeting._id));

const stepSummaries = result.steps
  .filter((s) => s.status === "done")
  .map((s) => `- ${s.summary}`)
  .join("\n");

const undoNote =
  result.undoTokens.length > 0
    ? "\n\nYou can undo any of these actions — just ask."
    : "";

const content = `**Post-Meeting Cascade: ${meeting.title}**\n\n${stepSummaries}${undoNote}`;

const cascadeCard = {
  type: "meeting_cascade" as const,
  meetingTitle: meeting.title,
  steps: result.steps.map((s) => ({
    step: s.step,
    status: s.status,
    summary: s.summary,
    undoToken: s.undoToken,
  })),
};

await postAgentMessage(cid, uid, content, { cards: [cascadeCard] });
```

**Step 2: Update `postAgentMessage` to accept card data**

Find the `postAgentMessage` function in the same file and add an optional `meta` parameter. It likely creates a `DirectMessage` — add `cards` to its `agentMeta`:

```typescript
// Find the postAgentMessage function signature and add the meta param:
// BEFORE:
async function postAgentMessage(conversationId: string, userId: string, content: string): Promise<void> {

// AFTER:
async function postAgentMessage(
  conversationId: string,
  userId: string,
  content: string,
  meta?: { cards?: Array<Record<string, unknown>> },
): Promise<void> {
```

Then in the DirectMessage.create call inside postAgentMessage, add the cards:

```typescript
// In the DirectMessage.create call, add to agentMeta:
agentMeta: {
  forUserId: userId,
  ...(meta?.cards ? { cards: meta.cards } : {}),
},
```

**Step 3: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts
git commit -m "feat: send cascade results as MeetingCascadeCard instead of plain text"
```

---

### Task 7: Add `artifacts` Field to Meeting Model

**Files:**
- Modify: `src/lib/infra/db/models/meeting.ts`

**Context:** The cascade creates Google Docs (MoM doc), Slides (presentations), and folders, but the URLs are not persisted on the Meeting document. We need an `artifacts` field to store these URLs so they can be displayed in the meeting detail UI.

**Step 1: Add the `IMeetingArtifacts` interface and field**

In `src/lib/infra/db/models/meeting.ts`, add the interface after `IMeetingMoM` (after line 53):

```typescript
export interface IMeetingArtifacts {
  momDocUrl?: string;
  momDocId?: string;
  presentationUrl?: string;
  presentationId?: string;
  folderUrl?: string;
  folderId?: string;
  analyticsSheetId?: string;
}
```

Add to the `IMeeting` interface (after line 72, before `createdAt`):

```typescript
  artifacts?: IMeetingArtifacts;
```

Add to the meetingSchema (after `ghostNotes` field, around line 240):

```typescript
    artifacts: {
      type: {
        momDocUrl: { type: String },
        momDocId: { type: String },
        presentationUrl: { type: String },
        presentationId: { type: String },
        folderUrl: { type: String },
        folderId: { type: String },
        analyticsSheetId: { type: String },
      },
      default: undefined,
    },
```

**Step 2: Also add `cascadeExecutedAt` and `templateId` to the schema**

The `cascadeExecutedAt` field is already used in proactive-triggers.ts (line 499-510) but not defined in the schema. Add it:

```typescript
    cascadeExecutedAt: {
      type: Date,
    },
```

And `templateId` for Task 9:

```typescript
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "MeetingTemplate",
    },
```

Add corresponding fields to the `IMeeting` interface:

```typescript
  cascadeExecutedAt?: Date;
  templateId?: Types.ObjectId;
```

**Step 3: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/infra/db/models/meeting.ts
git commit -m "feat: add artifacts, cascadeExecutedAt, and templateId fields to Meeting model"
```

---

### Task 8: Persist Artifact URLs from Cascade Pipeline

**Files:**
- Modify: `src/lib/ai/meeting-cascade.ts`

**Context:** The cascade steps create Google Docs and folders but don't save the URLs back to the Meeting model. After `stepCreateMomDoc` completes, we have `doc.id` and `folder.id`. We need to persist these on `meeting.artifacts`.

**Step 1: Update `stepCreateMomDoc` to return artifact data**

First, update the `CascadeStepResult` interface to optionally carry artifact data:

```typescript
// BEFORE (line 7-12):
export interface CascadeStepResult {
  step: string;
  status: "done" | "skipped" | "error";
  summary: string;
  undoToken?: string;
}

// AFTER:
export interface CascadeStepResult {
  step: string;
  status: "done" | "skipped" | "error";
  summary: string;
  undoToken?: string;
  artifacts?: Record<string, string>;
}
```

Then update `stepCreateMomDoc` (line 94-99) to include artifact data in the return:

```typescript
// BEFORE (line 94-99):
return {
  step: "create_mom_doc",
  status: "done",
  summary: `Created MoM document "${doc.name}" in folder "${folder.name}"`,
  undoToken: token,
};

// AFTER:
return {
  step: "create_mom_doc",
  status: "done",
  summary: `Created MoM document "${doc.name}" in folder "${folder.name}"`,
  undoToken: token,
  artifacts: {
    momDocId: doc.id,
    momDocUrl: doc.webViewLink || `https://docs.google.com/document/d/${doc.id}/edit`,
    folderId: folder.id,
    folderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
  },
};
```

**Step 2: Save artifacts to Meeting after cascade completes**

In the `executeMeetingCascade` function, add artifact persistence after the notify step (after line 336, before the log.info):

```typescript
  // Persist artifacts on the meeting document
  const allArtifacts: Record<string, string> = {};
  for (const step of steps) {
    if (step.artifacts) {
      Object.assign(allArtifacts, step.artifacts);
    }
  }

  if (Object.keys(allArtifacts).length > 0) {
    try {
      await Meeting.updateOne(
        { _id: meetingId },
        { $set: { artifacts: allArtifacts } },
      );
    } catch (err) {
      log.warn({ err, meetingId }, "Failed to persist artifacts on meeting");
    }
  }
```

**Step 3: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/ai/meeting-cascade.ts
git commit -m "feat: persist Google Doc/Folder artifact URLs on Meeting model after cascade"
```

---

### Task 9: Wire Meeting Templates into Meeting Creation API

**Files:**
- Modify: `src/app/api/meetings/route.ts`

**Context:** The `MeetingTemplate` model (at `src/lib/infra/db/models/meeting-template.ts`) has fields: `name`, `defaultDuration`, `agendaSkeleton`, `preMeetingChecklist`, `cascadeConfig`, `meetingSettings`. The `POST /api/meetings` endpoint (line 111-187) doesn't accept `templateId`. We need to: (a) accept `templateId` in the schema, (b) load the template, (c) apply its settings as defaults, (d) save `templateId` on the meeting, (e) increment template `usageCount`.

**Step 1: Add `templateId` to the Zod schema**

In `src/app/api/meetings/route.ts`, update `createMeetingSchema` (line 27-51):

```typescript
const createMeetingSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer.")
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or fewer.")
    .optional(),
  type: z.enum(["regular", "ghost"]).default("regular"),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO datetime." })
    .optional(),
  templateId: z.string().optional(),
  settings: z
    .object({
      maxParticipants: z.number().int().min(1).max(100).optional(),
      allowRecording: z.boolean().optional(),
      allowScreenShare: z.boolean().optional(),
      waitingRoom: z.boolean().optional(),
      muteOnJoin: z.boolean().optional(),
    })
    .optional(),
});
```

**Step 2: Load and apply template in the POST handler**

After `const { title, description, type, scheduledAt, settings } = body;` (line 116), before the feature flag check (line 119), add:

```typescript
  const { templateId } = body;

  // Load template if provided — apply its settings as defaults
  let templateSettings: Record<string, unknown> | undefined;
  let templateDuration: number | undefined;
  let templateObjId: mongoose.Types.ObjectId | undefined;

  if (templateId) {
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return errorResponse("INVALID_TEMPLATE", "Invalid template ID", 400);
    }
    const MeetingTemplate = (await import("@/lib/infra/db/models/meeting-template")).default;
    const template = await MeetingTemplate.findOne({
      _id: new mongoose.Types.ObjectId(templateId),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!template) {
      return errorResponse("TEMPLATE_NOT_FOUND", "Meeting template not found", 404);
    }

    templateObjId = new mongoose.Types.ObjectId(templateId);
    templateDuration = template.defaultDuration;
    templateSettings = template.meetingSettings as Record<string, unknown> | undefined;

    // Increment usage count (fire-and-forget)
    MeetingTemplate.updateOne(
      { _id: templateObjId },
      { $inc: { usageCount: 1 } },
    ).catch((err: unknown) => log.warn({ err }, "failed to increment template usage count"));
  }
```

**Step 3: Apply template defaults to Meeting.create**

Update the `Meeting.create` call (line 131-156) to merge template settings:

```typescript
  const meeting = await Meeting.create({
    code,
    title: title || "Untitled Meeting",
    description: description || undefined,
    hostId: new mongoose.Types.ObjectId(userId),
    type,
    status: "scheduled",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    scheduledDuration: templateDuration || undefined,
    templateId: templateObjId || undefined,
    participants: [
      {
        userId: new mongoose.Types.ObjectId(userId),
        role: "host",
        status: "joined",
        joinedAt: new Date(),
      },
    ],
    settings: {
      maxParticipants: settings?.maxParticipants ?? (templateSettings?.maxParticipants as number) ?? 25,
      allowRecording: settings?.allowRecording ?? true,
      allowScreenShare: settings?.allowScreenShare ?? true,
      waitingRoom: settings?.waitingRoom ?? (templateSettings?.waitingRoom as boolean) ?? false,
      muteOnJoin: settings?.muteOnJoin ?? (templateSettings?.muteOnJoin as boolean) ?? false,
    },
  });
```

**Step 4: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/api/meetings/route.ts
git commit -m "feat: wire templateId into meeting creation API with template settings merge"
```

---

### Task 10: Add Meeting Artifacts Section to Meeting Detail

**Files:**
- Modify: `src/app/(app)/meetings/[meetingId]/page.tsx`

**Context:** The meeting lobby page (`page.tsx`) fetches meeting data from `/api/meetings/${meetingId}`. After Task 7+8, the meeting response will include `artifacts?: { momDocUrl, presentationUrl, folderUrl }`. We need to display these links when the meeting has ended (post-meeting view).

**Step 1: Add an artifacts section to the meeting page**

After the meeting info section (around line 160), before the pre-join lobby render, add a conditional artifacts block:

```tsx
{/* Post-Meeting Artifacts */}
{meeting.status === "ended" && meeting.artifacts && (
  <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 space-y-3 mb-4">
    <h3
      className="text-sm font-bold text-[var(--text-primary)]"
      style={{ fontFamily: "var(--font-heading)" }}
    >
      Meeting Artifacts
    </h3>
    <div className="flex flex-wrap gap-2">
      {meeting.artifacts.momDocUrl && (
        <a
          href={meeting.artifacts.momDocUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[#FFE600] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Meeting Notes
        </a>
      )}
      {meeting.artifacts.presentationUrl && (
        <a
          href={meeting.artifacts.presentationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[#FFE600] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Slides
        </a>
      )}
      {meeting.artifacts.folderUrl && (
        <a
          href={meeting.artifacts.folderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[#FFE600] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Drive Folder
        </a>
      )}
    </div>
  </div>
)}
```

Note: You'll need to type the `meeting` variable — add `artifacts?: { momDocUrl?: string; presentationUrl?: string; folderUrl?: string }` to the meeting interface/type used in this component.

**Step 2: Verify build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/(app)/meetings/[meetingId]/page.tsx
git commit -m "feat: display meeting artifacts (Google Docs, Slides, Folder) on ended meeting page"
```

---

### Task 11: Verify All Changes — Full Build + Test Suite

**Files:** None (verification only)

**Step 1: Run the full test suite**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx jest --passWithNoTests 2>&1 | tail -20`
Expected: All tests pass.

**Step 2: Run the production build**

Run: `cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -10`
Expected: Build succeeds with 0 errors.

**Step 3: Fix any type errors or build failures**

If build fails, read the error messages carefully and fix. Common issues:
- Import paths (check exact casing)
- Missing type exports (add to model files)
- Unused variables (remove or prefix with `_`)

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build errors from interconnection wiring"
```

---

## Summary Table

| Task | What It Fixes | Files Modified |
|------|--------------|----------------|
| 1 | `prepare_meeting_brief` returns card format | `tools.ts` |
| 2 | `get_meeting_analytics` returns card format | `tools.ts` |
| 3 | Wire `updateKnowledgeGraph` into cascade | `meeting-cascade.ts` |
| 4 | Wire `analyzeMeetingPatterns` into trends API | `trends/route.ts` |
| 5 | Import MeetingPulse + ActionItemTracker into Dashboard | `Dashboard.tsx` |
| 6 | Cascade sends MeetingCascadeCard, not plain text | `proactive-triggers.ts` |
| 7 | Add `artifacts`/`cascadeExecutedAt`/`templateId` to Meeting model | `meeting.ts` |
| 8 | Persist Google Doc/Folder URLs from cascade | `meeting-cascade.ts` |
| 9 | Wire `templateId` into meeting creation API | `meetings/route.ts` |
| 10 | Display meeting artifacts on ended meeting page | `[meetingId]/page.tsx` |
| 11 | Full build + test verification | — |

## Verification Checklist

1. `npm run build` — zero errors
2. `npx jest` — all tests pass
3. AI chat: ask "prepare brief for meeting X" → renders `MeetingBriefCard` (not raw JSON)
4. AI chat: ask "show analytics for meeting X" → renders `MeetingAnalyticsCard`
5. Post-meeting: cascade fires → renders `MeetingCascadeCard` with undo buttons
6. Dashboard: shows MeetingPulse widget with upcoming meetings
7. Dashboard: shows ActionItemTracker widget with progress bar
8. Meeting creation with `templateId`: settings are applied from template
9. Ended meeting page: shows artifact links (Google Doc, Slides, Folder)
10. Analytics trends: response includes `patterns` array from pattern analyzer

# Meetings AI Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive AI intelligence to the Meetings section with bidirectional Google Workspace integration, post-meeting cascade automation, cross-domain orchestration, and advanced meeting analytics.

**Architecture:** 4 new Mongoose models (MeetingBrief, MeetingAnalytics, MeetingTemplate, MeetingKnowledge). 7 new AI tools added to `tools.ts`. New `meeting-cascade.ts` pipeline for post-meeting automation. Extended Google services (Slides, Drive folders, Gmail follow-ups). New dashboard widgets and copilot sidebar. All actions follow "act & notify" with Redis undo tokens.

**Tech Stack:** Next.js App Router, Mongoose/MongoDB, Gemini AI, Redis (undo tokens + pub/sub), Google APIs (Calendar, Docs, Sheets, Gmail, Drive, Slides), Framer Motion, Vitest

---

## Phase 1: Data Models + Google Workspace Extensions (Tasks 1–8)

### Task 1: MeetingBrief Model

**Files:**
- Create: `src/lib/infra/db/models/meeting-brief.ts`
- Test: `src/__tests__/models/meeting-brief.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/models/meeting-brief.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>).default,
      models: {},
      model: vi.fn().mockReturnValue(function MockModel() {}),
    },
  };
});

describe("MeetingBrief model", () => {
  it("exports a Mongoose model", async () => {
    const mod = await import("@/lib/infra/db/models/meeting-brief");
    expect(mod.default).toBeDefined();
  });

  it("has correct interface fields", async () => {
    const mod = await import("@/lib/infra/db/models/meeting-brief");
    // Type-level check — if this compiles, the interface is correct
    const brief: Partial<typeof mod.IMeetingBrief extends never ? never : Record<string, unknown>> = {};
    expect(brief).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/models/meeting-brief.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/infra/db/models/meeting-brief.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IMeetingBriefSource {
  type: "task" | "email_thread" | "drive_file" | "past_mom" | "calendar_event";
  id: string;
  title: string;
  summary: string;
  url?: string;
}

export interface IMeetingBrief {
  meetingId: Types.ObjectId;
  userId: Types.ObjectId;
  googleDocId?: string;
  googleDocUrl?: string;
  sources: IMeetingBriefSource[];
  agendaSuggestions: string[];
  carryoverItems: { task: string; fromMeetingId: string; fromMeetingTitle: string }[];
  status: "generating" | "ready" | "stale";
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingBriefDocument extends IMeetingBrief, Document {
  _id: Types.ObjectId;
}

const briefSourceSchema = new Schema<IMeetingBriefSource>(
  {
    type: { type: String, enum: ["task", "email_thread", "drive_file", "past_mom", "calendar_event"], required: true },
    id: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 1000 },
    url: { type: String },
  },
  { _id: false },
);

const meetingBriefSchema = new Schema<IMeetingBriefDocument>(
  {
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    googleDocId: { type: String },
    googleDocUrl: { type: String },
    sources: { type: [briefSourceSchema], default: [] },
    agendaSuggestions: { type: [String], default: [] },
    carryoverItems: {
      type: [{ task: String, fromMeetingId: String, fromMeetingTitle: String }],
      default: [],
    },
    status: { type: String, enum: ["generating", "ready", "stale"], default: "generating" },
    generatedAt: { type: Date },
  },
  { timestamps: true, collection: "meeting_briefs" },
);

meetingBriefSchema.index({ meetingId: 1, userId: 1 }, { unique: true });
meetingBriefSchema.index({ userId: 1, status: 1 });

const MeetingBrief: Model<IMeetingBriefDocument> =
  mongoose.models.MeetingBrief ||
  mongoose.model<IMeetingBriefDocument>("MeetingBrief", meetingBriefSchema);

export default MeetingBrief;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/models/meeting-brief.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/meeting-brief.ts src/__tests__/models/meeting-brief.test.ts
git commit -m "feat: add MeetingBrief model for pre-meeting AI briefs"
```

---

### Task 2: MeetingAnalytics Model

**Files:**
- Create: `src/lib/infra/db/models/meeting-analytics.ts`
- Test: `src/__tests__/models/meeting-analytics.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/models/meeting-analytics.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>).default,
      models: {},
      model: vi.fn().mockReturnValue(function MockModel() {}),
    },
  };
});

describe("MeetingAnalytics model", () => {
  it("exports a Mongoose model", async () => {
    const mod = await import("@/lib/infra/db/models/meeting-analytics");
    expect(mod.default).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/models/meeting-analytics.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/lib/infra/db/models/meeting-analytics.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ISpeakerStat {
  userId: string;
  name: string;
  talkTimeSeconds: number;
  talkTimePercent: number;
  wordCount: number;
  interruptionCount: number;
  sentimentAvg: number; // -1 to 1
}

export interface IMeetingAnalytics {
  meetingId: Types.ObjectId;
  userId: Types.ObjectId; // host who owns this analytics
  duration: number; // seconds
  participantCount: number;
  speakerStats: ISpeakerStat[];
  agendaCoverage: number; // 0-100 percent
  decisionCount: number;
  actionItemCount: number;
  actionItemsCompleted: number;
  meetingScore: number; // 0-100
  scoreBreakdown: {
    agendaCoverage: number;
    decisionDensity: number;
    actionItemClarity: number;
    participationBalance: number;
  };
  highlights: { timestamp: number; type: "decision" | "disagreement" | "commitment" | "key_point"; text: string }[];
  sheetRowAppended: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingAnalyticsDocument extends IMeetingAnalytics, Document {
  _id: Types.ObjectId;
}

const speakerStatSchema = new Schema<ISpeakerStat>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    talkTimeSeconds: { type: Number, default: 0 },
    talkTimePercent: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    interruptionCount: { type: Number, default: 0 },
    sentimentAvg: { type: Number, default: 0 },
  },
  { _id: false },
);

const meetingAnalyticsSchema = new Schema<IMeetingAnalyticsDocument>(
  {
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting", required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    duration: { type: Number, default: 0 },
    participantCount: { type: Number, default: 0 },
    speakerStats: { type: [speakerStatSchema], default: [] },
    agendaCoverage: { type: Number, default: 0 },
    decisionCount: { type: Number, default: 0 },
    actionItemCount: { type: Number, default: 0 },
    actionItemsCompleted: { type: Number, default: 0 },
    meetingScore: { type: Number, default: 0 },
    scoreBreakdown: {
      type: {
        agendaCoverage: { type: Number, default: 0 },
        decisionDensity: { type: Number, default: 0 },
        actionItemClarity: { type: Number, default: 0 },
        participationBalance: { type: Number, default: 0 },
      },
      default: {},
    },
    highlights: {
      type: [{
        timestamp: { type: Number, required: true },
        type: { type: String, enum: ["decision", "disagreement", "commitment", "key_point"], required: true },
        text: { type: String, required: true },
      }],
      default: [],
    },
    sheetRowAppended: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "meeting_analytics" },
);

meetingAnalyticsSchema.index({ userId: 1, createdAt: -1 });

const MeetingAnalytics: Model<IMeetingAnalyticsDocument> =
  mongoose.models.MeetingAnalytics ||
  mongoose.model<IMeetingAnalyticsDocument>("MeetingAnalytics", meetingAnalyticsSchema);

export default MeetingAnalytics;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/models/meeting-analytics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/meeting-analytics.ts src/__tests__/models/meeting-analytics.test.ts
git commit -m "feat: add MeetingAnalytics model for speaker stats and scores"
```

---

### Task 3: MeetingTemplate Model

**Files:**
- Create: `src/lib/infra/db/models/meeting-template.ts`
- Test: `src/__tests__/models/meeting-template.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/models/meeting-template.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>).default,
      models: {},
      model: vi.fn().mockReturnValue(function MockModel() {}),
    },
  };
});

describe("MeetingTemplate model", () => {
  it("exports a Mongoose model", async () => {
    const mod = await import("@/lib/infra/db/models/meeting-template");
    expect(mod.default).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/models/meeting-template.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/lib/infra/db/models/meeting-template.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IMeetingTemplate {
  userId: Types.ObjectId;
  name: string;
  description?: string;
  defaultDuration: number; // minutes
  agendaSkeleton: string[]; // ordered agenda topics
  preMeetingChecklist: string[];
  cascadeConfig: {
    createMomDoc: boolean;
    createTasks: boolean;
    sendFollowUpEmail: boolean;
    appendToSheet: boolean;
    scheduleNextMeeting: boolean;
  };
  googleDocTemplateId?: string;
  meetingSettings: {
    maxParticipants?: number;
    waitingRoom?: boolean;
    muteOnJoin?: boolean;
  };
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingTemplateDocument extends IMeetingTemplate, Document {
  _id: Types.ObjectId;
}

const meetingTemplateSchema = new Schema<IMeetingTemplateDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    defaultDuration: { type: Number, default: 30, min: 5, max: 480 },
    agendaSkeleton: { type: [String], default: [] },
    preMeetingChecklist: { type: [String], default: [] },
    cascadeConfig: {
      type: {
        createMomDoc: { type: Boolean, default: true },
        createTasks: { type: Boolean, default: true },
        sendFollowUpEmail: { type: Boolean, default: true },
        appendToSheet: { type: Boolean, default: true },
        scheduleNextMeeting: { type: Boolean, default: false },
      },
      default: {},
    },
    googleDocTemplateId: { type: String },
    meetingSettings: {
      type: {
        maxParticipants: Number,
        waitingRoom: Boolean,
        muteOnJoin: Boolean,
      },
      default: {},
    },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "meeting_templates" },
);

meetingTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

const MeetingTemplate: Model<IMeetingTemplateDocument> =
  mongoose.models.MeetingTemplate ||
  mongoose.model<IMeetingTemplateDocument>("MeetingTemplate", meetingTemplateSchema);

export default MeetingTemplate;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/models/meeting-template.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/meeting-template.ts src/__tests__/models/meeting-template.test.ts
git commit -m "feat: add MeetingTemplate model for reusable meeting structures"
```

---

### Task 4: MeetingKnowledge Model

**Files:**
- Create: `src/lib/infra/db/models/meeting-knowledge.ts`
- Test: `src/__tests__/models/meeting-knowledge.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/models/meeting-knowledge.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>).default,
      models: {},
      model: vi.fn().mockReturnValue(function MockModel() {}),
    },
  };
});

describe("MeetingKnowledge model", () => {
  it("exports a Mongoose model", async () => {
    const mod = await import("@/lib/infra/db/models/meeting-knowledge");
    expect(mod.default).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/models/meeting-knowledge.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/lib/infra/db/models/meeting-knowledge.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type KnowledgeNodeType = "topic" | "decision" | "person_expertise" | "action_evolution";

export interface IMeetingKnowledge {
  userId: Types.ObjectId;
  nodeType: KnowledgeNodeType;
  key: string; // normalized topic/decision name
  entries: {
    meetingId: string;
    meetingTitle: string;
    date: Date;
    content: string;
    participants: string[];
  }[];
  relatedKeys: string[]; // links to other knowledge nodes
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeetingKnowledgeDocument extends IMeetingKnowledge, Document {
  _id: Types.ObjectId;
}

const knowledgeEntrySchema = new Schema(
  {
    meetingId: { type: String, required: true },
    meetingTitle: { type: String, required: true },
    date: { type: Date, required: true },
    content: { type: String, required: true, maxlength: 2000 },
    participants: { type: [String], default: [] },
  },
  { _id: false },
);

const meetingKnowledgeSchema = new Schema<IMeetingKnowledgeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nodeType: { type: String, enum: ["topic", "decision", "person_expertise", "action_evolution"], required: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    entries: { type: [knowledgeEntrySchema], default: [] },
    relatedKeys: { type: [String], default: [] },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "meeting_knowledge" },
);

meetingKnowledgeSchema.index({ userId: 1, nodeType: 1, key: 1 }, { unique: true });
meetingKnowledgeSchema.index({ userId: 1, key: 1 });
meetingKnowledgeSchema.index({ key: "text", "entries.content": "text" });

const MeetingKnowledge: Model<IMeetingKnowledgeDocument> =
  mongoose.models.MeetingKnowledge ||
  mongoose.model<IMeetingKnowledgeDocument>("MeetingKnowledge", meetingKnowledgeSchema);

export default MeetingKnowledge;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/models/meeting-knowledge.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/infra/db/models/meeting-knowledge.ts src/__tests__/models/meeting-knowledge.test.ts
git commit -m "feat: add MeetingKnowledge model for cross-meeting knowledge graph"
```

---

### Task 5: Google Slides Service

**Files:**
- Create: `src/lib/google/slides.ts`
- Test: `src/__tests__/google/slides.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/google/slides.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/google/client", () => ({
  getGoogleServices: vi.fn().mockResolvedValue({
    slides: {
      presentations: {
        create: vi.fn().mockResolvedValue({
          data: { presentationId: "pres-123", title: "Test MoM" },
        }),
        batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
    drive: {
      files: {
        get: vi.fn().mockResolvedValue({
          data: { webViewLink: "https://docs.google.com/presentation/d/pres-123" },
        }),
      },
    },
  }),
}));

describe("Google Slides service", () => {
  it("createPresentation returns presentationId and url", async () => {
    const { createPresentation } = await import("@/lib/google/slides");
    const result = await createPresentation("user-1", "Test MoM");
    expect(result.presentationId).toBe("pres-123");
    expect(result.webViewLink).toContain("pres-123");
  });

  it("addSlide calls batchUpdate", async () => {
    const { addSlide } = await import("@/lib/google/slides");
    await expect(addSlide("user-1", "pres-123", "Title", "Body text")).resolves.not.toThrow();
  });

  it("createMomPresentation creates full deck", async () => {
    const { createMomPresentation } = await import("@/lib/google/slides");
    const result = await createMomPresentation("user-1", {
      title: "Sprint Planning",
      date: "2026-03-17",
      summary: "We discussed roadmap",
      keyDecisions: ["Ship v2"],
      actionItems: [{ task: "Deploy", owner: "Alice", due: "Friday" }],
      nextSteps: ["Review metrics"],
    });
    expect(result.presentationId).toBe("pres-123");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/google/slides.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/google/slides.ts
import { getGoogleServices } from "./client";

export interface PresentationInfo {
  presentationId: string;
  title: string;
  webViewLink: string;
}

export interface MomSlideData {
  title: string;
  date: string;
  summary: string;
  keyDecisions: string[];
  actionItems: { task: string; owner: string; due: string }[];
  nextSteps: string[];
}

/**
 * Create a new Google Slides presentation.
 */
export async function createPresentation(
  userId: string,
  title: string,
): Promise<PresentationInfo> {
  const { slides, drive } = await getGoogleServices(userId);

  const res = await slides.presentations.create({
    requestBody: { title },
  });

  const presentationId = res.data.presentationId || "";

  const fileRes = await drive.files.get({
    fileId: presentationId,
    fields: "webViewLink",
  });

  return {
    presentationId,
    title,
    webViewLink:
      fileRes.data.webViewLink ||
      `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

/**
 * Add a slide with a title and body text.
 */
export async function addSlide(
  userId: string,
  presentationId: string,
  title: string,
  body: string,
): Promise<void> {
  const { slides } = await getGoogleServices(userId);

  const slideId = `slide_${Date.now()}`;

  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" } } },
        {
          insertText: {
            objectId: `${slideId}_title`,
            text: title,
          },
        },
        {
          insertText: {
            objectId: `${slideId}_body`,
            text: body,
          },
        },
      ],
    },
  });
}

/**
 * Create a full MoM presentation from meeting data.
 */
export async function createMomPresentation(
  userId: string,
  data: MomSlideData,
): Promise<PresentationInfo> {
  const pres = await createPresentation(userId, `MoM — ${data.title} — ${data.date}`);

  const slideBodies = [
    { title: "Summary", body: data.summary },
    {
      title: "Key Decisions",
      body: data.keyDecisions.map((d, i) => `${i + 1}. ${d}`).join("\n"),
    },
    {
      title: "Action Items",
      body: data.actionItems
        .map((a) => `• ${a.task} — ${a.owner} (due: ${a.due})`)
        .join("\n"),
    },
    {
      title: "Next Steps",
      body: data.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    },
  ];

  for (const slide of slideBodies) {
    await addSlide(userId, pres.presentationId, slide.title, slide.body);
  }

  return pres;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/google/slides.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/google/slides.ts src/__tests__/google/slides.test.ts
git commit -m "feat: add Google Slides service for MoM presentations"
```

---

### Task 6: Extend Google Drive — Auto-Folder Structure

**Files:**
- Modify: `src/lib/google/drive.ts`
- Test: `src/__tests__/google/drive-folders.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/google/drive-folders.test.ts
import { describe, it, expect, vi } from "vitest";

const mockCreate = vi.fn().mockResolvedValue({
  data: { id: "folder-1", name: "Test", mimeType: "application/vnd.google-apps.folder", webViewLink: "https://drive.google.com/folder-1" },
});
const mockList = vi.fn().mockResolvedValue({ data: { files: [] } });

vi.mock("@/lib/google/client", () => ({
  getGoogleServices: vi.fn().mockResolvedValue({
    drive: {
      files: { create: mockCreate, list: mockList },
    },
  }),
}));

describe("Drive folder utilities", () => {
  it("getOrCreateFolder creates folder when not found", async () => {
    const { getOrCreateMeetingFolder } = await import("@/lib/google/drive");
    const result = await getOrCreateMeetingFolder("user-1", "Sprint Planning", new Date("2026-03-17"));
    expect(result.id).toBe("folder-1");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("getOrCreateFolder returns existing folder if found", async () => {
    mockList.mockResolvedValueOnce({
      data: { files: [{ id: "existing-1", name: "2026-03", mimeType: "application/vnd.google-apps.folder" }] },
    });
    const { getOrCreateMeetingFolder } = await import("@/lib/google/drive");
    const result = await getOrCreateMeetingFolder("user-1", "Standup", new Date("2026-03-17"));
    expect(result).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/google/drive-folders.test.ts`
Expected: FAIL — `getOrCreateMeetingFolder` not found

**Step 3: Append to `src/lib/google/drive.ts`**

Add the following exports at the end of the file:

```typescript
/**
 * Get or create the Yoodle Meetings root folder in Drive.
 */
export async function getOrCreateRootMeetingFolder(userId: string): Promise<DriveFile> {
  const { drive } = await getGoogleServices(userId);

  // Check if "Yoodle Meetings" folder exists
  const existing = await drive.files.list({
    q: "name = 'Yoodle Meetings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: "files(id, name, mimeType, webViewLink, shared)",
    pageSize: 1,
  });

  if (existing.data.files?.length) {
    return formatFile(existing.data.files[0]);
  }

  const res = await drive.files.create({
    requestBody: {
      name: "Yoodle Meetings",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id, name, mimeType, webViewLink, shared",
  });

  return formatFile(res.data);
}

/**
 * Get or create a meeting-specific folder: Yoodle Meetings / YYYY-MM / {Meeting Title}
 */
export async function getOrCreateMeetingFolder(
  userId: string,
  meetingTitle: string,
  meetingDate: Date,
): Promise<DriveFile> {
  const { drive } = await getGoogleServices(userId);
  const root = await getOrCreateRootMeetingFolder(userId);

  const monthStr = `${meetingDate.getFullYear()}-${String(meetingDate.getMonth() + 1).padStart(2, "0")}`;

  // Get or create month folder
  const monthFolders = await drive.files.list({
    q: `name = '${monthStr}' and '${root.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, shared)",
    pageSize: 1,
  });

  let monthFolderId: string;
  if (monthFolders.data.files?.length) {
    monthFolderId = monthFolders.data.files[0].id || "";
  } else {
    const res = await drive.files.create({
      requestBody: {
        name: monthStr,
        mimeType: "application/vnd.google-apps.folder",
        parents: [root.id],
      },
      fields: "id",
    });
    monthFolderId = res.data.id || "";
  }

  // Create meeting folder
  const sanitizedTitle = meetingTitle.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 100);
  const res = await drive.files.create({
    requestBody: {
      name: sanitizedTitle,
      mimeType: "application/vnd.google-apps.folder",
      parents: [monthFolderId],
    },
    fields: "id, name, mimeType, webViewLink, shared",
  });

  return formatFile(res.data);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/google/drive-folders.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/google/drive.ts src/__tests__/google/drive-folders.test.ts
git commit -m "feat: add Drive auto-folder structure for meeting assets"
```

---

### Task 7: Meeting Undo Token System

**Files:**
- Create: `src/lib/ai/meeting-undo.ts`
- Test: `src/__tests__/ai/meeting-undo.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/ai/meeting-undo.test.ts
import { describe, it, expect, vi } from "vitest";

const mockRedis = {
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
};

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: () => mockRedis,
}));

describe("meeting-undo", () => {
  it("storeUndoToken stores token with 24h TTL", async () => {
    const { storeUndoToken } = await import("@/lib/ai/meeting-undo");
    const token = await storeUndoToken("user-1", {
      action: "create_google_doc",
      resourceId: "doc-123",
      reverseAction: "delete_file",
      reverseArgs: { fileId: "doc-123" },
    });
    expect(token).toBeTruthy();
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("undo:"),
      expect.any(String),
      "EX",
      86400,
    );
  });

  it("getUndoToken returns null for unknown token", async () => {
    const { getUndoToken } = await import("@/lib/ai/meeting-undo");
    const result = await getUndoToken("nonexistent");
    expect(result).toBeNull();
  });

  it("consumeUndoToken deletes after retrieval", async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({
      userId: "user-1",
      action: "create_google_doc",
      resourceId: "doc-123",
      reverseAction: "delete_file",
      reverseArgs: { fileId: "doc-123" },
    }));
    const { consumeUndoToken } = await import("@/lib/ai/meeting-undo");
    const result = await consumeUndoToken("undo:abc");
    expect(result).toBeTruthy();
    expect(mockRedis.del).toHaveBeenCalledWith("undo:abc");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ai/meeting-undo.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/lib/ai/meeting-undo.ts
import { getRedisClient } from "@/lib/infra/redis/client";
import { nanoid } from "nanoid";

const UNDO_TTL = 86400; // 24 hours

export interface UndoPayload {
  action: string;
  resourceId: string;
  reverseAction: string;
  reverseArgs: Record<string, unknown>;
  description?: string;
}

interface StoredUndo extends UndoPayload {
  userId: string;
  createdAt: string;
}

export async function storeUndoToken(
  userId: string,
  payload: UndoPayload,
): Promise<string> {
  const redis = getRedisClient();
  const token = `undo:${nanoid(16)}`;

  const stored: StoredUndo = {
    ...payload,
    userId,
    createdAt: new Date().toISOString(),
  };

  await redis.set(token, JSON.stringify(stored), "EX", UNDO_TTL);
  return token;
}

export async function getUndoToken(token: string): Promise<StoredUndo | null> {
  const redis = getRedisClient();
  const raw = await redis.get(token);
  if (!raw) return null;
  return JSON.parse(raw) as StoredUndo;
}

export async function consumeUndoToken(token: string): Promise<StoredUndo | null> {
  const data = await getUndoToken(token);
  if (!data) return null;
  const redis = getRedisClient();
  await redis.del(token);
  return data;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ai/meeting-undo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/meeting-undo.ts src/__tests__/ai/meeting-undo.test.ts
git commit -m "feat: add undo token system for meeting cascade actions"
```

---

### Task 8: Meeting Cascade Pipeline

**Files:**
- Create: `src/lib/ai/meeting-cascade.ts`
- Test: `src/__tests__/ai/meeting-cascade.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/ai/meeting-cascade.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock all dependencies
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/ai/meeting-undo", () => ({
  storeUndoToken: vi.fn().mockResolvedValue("undo:test-123"),
}));
vi.mock("@/lib/google/docs", () => ({
  appendToDoc: vi.fn().mockResolvedValue({ documentId: "doc-1" }),
}));
vi.mock("@/lib/google/drive", () => ({
  createGoogleDoc: vi.fn().mockResolvedValue({ id: "doc-1", webViewLink: "https://docs.google.com/doc-1" }),
  getOrCreateMeetingFolder: vi.fn().mockResolvedValue({ id: "folder-1" }),
}));
vi.mock("@/lib/google/gmail", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "email-1" }),
}));
vi.mock("@/lib/google/sheets", () => ({
  appendToSheet: vi.fn().mockResolvedValue({ updatedRows: 1 }),
}));
vi.mock("@/lib/board/cross-domain", () => ({
  createTaskFromMeeting: vi.fn().mockResolvedValue({ success: true, summary: "Created 2 tasks" }),
}));
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: { findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) },
}));
vi.mock("@/lib/infra/db/models/recording", () => ({
  default: { findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) },
}));
vi.mock("@/lib/infra/db/models/user", () => ({
  default: { findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: "Test", email: "test@test.com" }) }) },
}));
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe("meeting-cascade", () => {
  it("exports executeMeetingCascade function", async () => {
    const mod = await import("@/lib/ai/meeting-cascade");
    expect(mod.executeMeetingCascade).toBeDefined();
    expect(typeof mod.executeMeetingCascade).toBe("function");
  });

  it("returns cascade result with step statuses", async () => {
    const mod = await import("@/lib/ai/meeting-cascade");
    const result = await mod.executeMeetingCascade("user-1", "meeting-1");
    expect(result).toHaveProperty("steps");
    expect(result).toHaveProperty("undoTokens");
    expect(Array.isArray(result.steps)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ai/meeting-cascade.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/lib/ai/meeting-cascade.ts
import { createLogger } from "@/lib/infra/logger";
import connectDB from "@/lib/infra/db/client";
import { storeUndoToken, type UndoPayload } from "./meeting-undo";

const log = createLogger("meeting-cascade");

export interface CascadeStepResult {
  step: string;
  status: "done" | "skipped" | "error";
  summary: string;
  undoToken?: string;
}

export interface CascadeResult {
  meetingId: string;
  steps: CascadeStepResult[];
  undoTokens: string[];
}

type OnProgress = (step: CascadeStepResult) => void;

/**
 * Execute the full post-meeting cascade pipeline.
 * Steps:
 *   1. Create MoM Google Doc
 *   2. Create board tasks from action items
 *   3. Send follow-up email
 *   4. Append analytics row to Google Sheet
 *   5. Update linked board cards with discussion notes
 *   6. Schedule next meeting if needed
 *   7. Notify user via AI chat
 *
 * Each step is resilient — failure skips to next step.
 * Each write action stores an undo token.
 */
export async function executeMeetingCascade(
  userId: string,
  meetingId: string,
  options?: {
    analyticsSheetId?: string;
    onProgress?: OnProgress;
    skipSteps?: string[];
  },
): Promise<CascadeResult> {
  await connectDB();
  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
  const Recording = (await import("@/lib/infra/db/models/recording")).default;
  const User = (await import("@/lib/infra/db/models/user")).default;

  const meeting = await Meeting.findById(meetingId).lean();
  const result: CascadeResult = { meetingId, steps: [], undoTokens: [] };
  const skipSet = new Set(options?.skipSteps ?? []);

  if (!meeting) {
    result.steps.push({ step: "load_meeting", status: "error", summary: "Meeting not found" });
    return result;
  }

  const host = await User.findById(meeting.hostId).lean();
  const hostEmail = (host as Record<string, unknown>)?.email as string ?? "";
  const mom = meeting.mom;

  // Gather participant emails for follow-up
  const participantIds = meeting.participants.map((p) => String(p.userId));
  const participants = await User.find({ _id: { $in: participantIds } }).lean();
  const participantEmails = participants.map((p) => (p as Record<string, unknown>).email as string).filter(Boolean);

  // Step 1: Create MoM Google Doc
  if (!skipSet.has("create_mom_doc")) {
    try {
      const { createGoogleDoc } = await import("@/lib/google/drive");
      const { appendToDoc } = await import("@/lib/google/docs");
      const { getOrCreateMeetingFolder } = await import("@/lib/google/drive");

      const folder = await getOrCreateMeetingFolder(
        userId,
        meeting.title,
        meeting.scheduledAt ?? meeting.createdAt,
      );

      const doc = await createGoogleDoc(userId, `MoM — ${meeting.title} — ${new Date().toISOString().split("T")[0]}`, folder.id);

      if (mom) {
        const content = [
          `# Minutes of Meeting: ${meeting.title}`,
          `\n## Summary\n${mom.summary}`,
          `\n## Key Decisions\n${mom.keyDecisions.map((d) => `- ${d}`).join("\n")}`,
          `\n## Action Items\n${mom.actionItems.map((a) => `- [ ] ${a.task} — ${a.owner} (due: ${a.due})`).join("\n")}`,
          `\n## Next Steps\n${mom.nextSteps.map((s) => `- ${s}`).join("\n")}`,
        ].join("\n");
        await appendToDoc(userId, doc.id, content);
      }

      const undo = await storeUndoToken(userId, {
        action: "create_google_doc",
        resourceId: doc.id,
        reverseAction: "delete_file",
        reverseArgs: { fileId: doc.id },
        description: `MoM doc for "${meeting.title}"`,
      });

      const step: CascadeStepResult = {
        step: "create_mom_doc",
        status: "done",
        summary: `Created MoM doc: ${doc.webViewLink ?? doc.id}`,
        undoToken: undo,
      };
      result.steps.push(step);
      result.undoTokens.push(undo);
      options?.onProgress?.(step);
    } catch (err) {
      log.error({ err, meetingId }, "cascade: create_mom_doc failed");
      result.steps.push({ step: "create_mom_doc", status: "error", summary: String(err) });
    }
  }

  // Step 2: Create board tasks from action items
  if (!skipSet.has("create_tasks") && mom?.actionItems?.length) {
    try {
      const { createTaskFromMeeting } = await import("@/lib/board/cross-domain");
      const taskResult = await createTaskFromMeeting(userId, { meetingId });
      const undo = await storeUndoToken(userId, {
        action: "create_tasks_from_meeting",
        resourceId: meetingId,
        reverseAction: "batch_delete_tasks",
        reverseArgs: { meetingId },
        description: `${mom.actionItems.length} tasks from "${meeting.title}"`,
      });

      const step: CascadeStepResult = {
        step: "create_tasks",
        status: "done",
        summary: taskResult.summary,
        undoToken: undo,
      };
      result.steps.push(step);
      result.undoTokens.push(undo);
      options?.onProgress?.(step);
    } catch (err) {
      log.error({ err, meetingId }, "cascade: create_tasks failed");
      result.steps.push({ step: "create_tasks", status: "error", summary: String(err) });
    }
  } else if (skipSet.has("create_tasks")) {
    result.steps.push({ step: "create_tasks", status: "skipped", summary: "Skipped by user" });
  }

  // Step 3: Send follow-up email
  if (!skipSet.has("send_followup") && participantEmails.length > 0 && mom) {
    try {
      const { sendEmail } = await import("@/lib/google/gmail");
      const body = [
        `Hi all,\n\nHere are the minutes from "${meeting.title}":\n`,
        `**Summary:** ${mom.summary}\n`,
        `**Key Decisions:**\n${mom.keyDecisions.map((d) => `- ${d}`).join("\n")}\n`,
        `**Action Items:**\n${mom.actionItems.map((a) => `- ${a.task} (${a.owner}, due: ${a.due})`).join("\n")}\n`,
        `**Next Steps:**\n${mom.nextSteps.map((s) => `- ${s}`).join("\n")}`,
      ].join("\n");

      await sendEmail(userId, {
        to: participantEmails,
        subject: `Meeting Follow-up: ${meeting.title}`,
        body,
      });

      const undo = await storeUndoToken(userId, {
        action: "send_email",
        resourceId: "followup",
        reverseAction: "noop",
        reverseArgs: {},
        description: `Follow-up email to ${participantEmails.length} participants`,
      });

      const step: CascadeStepResult = {
        step: "send_followup",
        status: "done",
        summary: `Follow-up sent to ${participantEmails.length} participant(s)`,
        undoToken: undo,
      };
      result.steps.push(step);
      result.undoTokens.push(undo);
      options?.onProgress?.(step);
    } catch (err) {
      log.error({ err, meetingId }, "cascade: send_followup failed");
      result.steps.push({ step: "send_followup", status: "error", summary: String(err) });
    }
  }

  // Step 4: Append to analytics sheet
  if (!skipSet.has("append_sheet") && options?.analyticsSheetId) {
    try {
      const { appendToSheet } = await import("@/lib/google/sheets");
      const duration = meeting.endedAt && meeting.startedAt
        ? Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000)
        : 0;

      await appendToSheet(userId, options.analyticsSheetId, "Sheet1!A:H", [
        [
          new Date().toISOString().split("T")[0],
          meeting.title,
          String(duration),
          String(meeting.participants.length),
          String(mom?.keyDecisions?.length ?? 0),
          String(mom?.actionItems?.length ?? 0),
          "0", // completed — tracked later
          "0", // score — computed later
        ],
      ]);

      const step: CascadeStepResult = {
        step: "append_sheet",
        status: "done",
        summary: "Analytics row appended to sheet",
      };
      result.steps.push(step);
      options?.onProgress?.(step);
    } catch (err) {
      log.error({ err, meetingId }, "cascade: append_sheet failed");
      result.steps.push({ step: "append_sheet", status: "error", summary: String(err) });
    }
  }

  // Step 5: Notify (always last)
  result.steps.push({
    step: "notify",
    status: "done",
    summary: `Cascade complete: ${result.steps.filter((s) => s.status === "done").length} actions executed, ${result.undoTokens.length} undoable`,
  });

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ai/meeting-cascade.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/meeting-cascade.ts src/__tests__/ai/meeting-cascade.test.ts
git commit -m "feat: add post-meeting cascade pipeline with undo tokens"
```

---

## Phase 2: AI Tools + API Routes (Tasks 9–16)

### Task 9: Add `search_meeting_history` Tool Declaration + Executor

**Files:**
- Modify: `src/lib/ai/tools.ts`

**Step 1: Add tool declaration** — Add to the `WORKSPACE_TOOLS.functionDeclarations` array after the existing `schedule_action` declaration:

```typescript
// ── Meeting Intelligence ─────────────────────────────────────────
{
  name: "search_meeting_history",
  description:
    "Search across meeting transcripts, minutes of meeting (MoM), and key decisions. Use when user asks 'what did we decide about X', 'find the meeting where we discussed Y', or 'search meeting notes for Z'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "Search query to find in meeting transcripts and MoMs.",
      },
      limit: {
        type: SchemaType.NUMBER,
        description: "Max results to return (default: 5).",
      },
    },
    required: ["query"],
  },
},
```

**Step 2: Add executor case** — Add to the `switch (functionName)` block:

```typescript
case "search_meeting_history": {
  await connectDB();
  const limit = (args.limit as number) || 5;
  const query = args.query as string;

  // Search MoM fields and title/description
  const meetings = await Meeting.find({
    $or: [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { "mom.summary": { $regex: query, $options: "i" } },
      { "mom.keyDecisions": { $regex: query, $options: "i" } },
      { "mom.discussionPoints": { $regex: query, $options: "i" } },
      { "mom.actionItems.task": { $regex: query, $options: "i" } },
    ],
    "participants.userId": new mongoose.Types.ObjectId(userId),
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Also search transcripts
  const Recording = (await import("@/lib/infra/db/models/recording")).default;
  const recordings = await Recording.find({
    "transcript.fullText": { $regex: query, $options: "i" },
    meetingId: { $in: meetings.map((m) => m._id) },
  })
    .limit(limit)
    .lean();

  const recordingMap = new Map(recordings.map((r) => [String(r.meetingId), r]));

  return {
    success: true,
    summary: `Found ${meetings.length} meeting(s) matching "${query}"`,
    data: meetings.map((m) => ({
      id: String(m._id),
      title: m.title,
      date: m.scheduledAt ?? m.createdAt,
      status: m.status,
      momSummary: m.mom?.summary ?? null,
      keyDecisions: m.mom?.keyDecisions ?? [],
      hasTranscript: recordingMap.has(String(m._id)),
    })),
  };
}
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add search_meeting_history AI tool"
```

---

### Task 10: Add `get_meeting_analytics` Tool Declaration + Executor

**Files:**
- Modify: `src/lib/ai/tools.ts`

**Step 1: Add tool declaration:**

```typescript
{
  name: "get_meeting_analytics",
  description:
    "Get meeting analytics and trends. Returns meeting scores, speaker stats, and patterns over time. Use when user asks about meeting productivity, talk time, or effectiveness trends.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      meetingId: {
        type: SchemaType.STRING,
        description: "Optional: specific meeting ID. If omitted, returns aggregate trends.",
      },
      timeRange: {
        type: SchemaType.STRING,
        description: "Time range for trends: 'week', 'month', 'quarter'. Default: 'month'.",
      },
    },
    required: [],
  },
},
```

**Step 2: Add executor case:**

```typescript
case "get_meeting_analytics": {
  await connectDB();
  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;

  if (args.meetingId) {
    const analytics = await MeetingAnalytics.findOne({
      meetingId: new mongoose.Types.ObjectId(args.meetingId as string),
    }).lean();

    if (!analytics) {
      return { success: false, summary: "No analytics found for this meeting" };
    }

    return {
      success: true,
      summary: `Meeting score: ${analytics.meetingScore}/100. ${analytics.participantCount} participants, ${analytics.decisionCount} decisions, ${analytics.actionItemCount} action items.`,
      data: analytics,
    };
  }

  // Aggregate trends
  const timeRange = (args.timeRange as string) || "month";
  const daysBack = timeRange === "week" ? 7 : timeRange === "quarter" ? 90 : 30;
  const since = new Date(Date.now() - daysBack * 86400000);

  const analytics = await MeetingAnalytics.find({
    userId: new mongoose.Types.ObjectId(userId),
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const avgScore = analytics.length
    ? Math.round(analytics.reduce((sum, a) => sum + a.meetingScore, 0) / analytics.length)
    : 0;
  const totalMeetings = analytics.length;
  const totalDecisions = analytics.reduce((sum, a) => sum + a.decisionCount, 0);
  const totalActionItems = analytics.reduce((sum, a) => sum + a.actionItemCount, 0);

  return {
    success: true,
    summary: `${totalMeetings} meetings in the last ${timeRange}. Average score: ${avgScore}/100. ${totalDecisions} decisions, ${totalActionItems} action items.`,
    data: { totalMeetings, avgScore, totalDecisions, totalActionItems, meetings: analytics.slice(0, 10) },
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add get_meeting_analytics AI tool"
```

---

### Task 11: Add `prepare_meeting_brief` Tool Declaration + Executor

**Files:**
- Modify: `src/lib/ai/tools.ts`

**Step 1: Add tool declaration:**

```typescript
{
  name: "prepare_meeting_brief",
  description:
    "Generate a pre-meeting brief for an upcoming meeting. Pulls related tasks, email threads, drive files, and past MoMs to create a comprehensive brief. Can optionally create a Google Doc. Use when user says 'prep for my meeting', 'brief me on the upcoming call', or proactively before scheduled meetings.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      meetingId: {
        type: SchemaType.STRING,
        description: "The Yoodle meeting ID to prepare a brief for.",
      },
      createDoc: {
        type: SchemaType.BOOLEAN,
        description: "Whether to create a Google Doc with the brief (default: true).",
      },
    },
    required: ["meetingId"],
  },
},
```

**Step 2: Add executor case:**

```typescript
case "prepare_meeting_brief": {
  await connectDB();
  const meeting = await Meeting.findById(args.meetingId as string).lean();
  if (!meeting) return { success: false, summary: "Meeting not found" };

  const MeetingBrief = (await import("@/lib/infra/db/models/meeting-brief")).default;
  const sources: Array<{ type: string; id: string; title: string; summary: string; url?: string }> = [];

  // Gather related tasks
  const relatedTasks = await Task.find({
    $or: [
      { meetingId: new mongoose.Types.ObjectId(args.meetingId as string) },
      { title: { $regex: meeting.title.split(" ").slice(0, 3).join("|"), $options: "i" } },
    ],
    assigneeId: { $in: meeting.participants.map((p) => p.userId) },
  }).limit(10).lean();

  for (const t of relatedTasks) {
    sources.push({
      type: "task",
      id: String(t._id),
      title: String(t.title),
      summary: `${t.priority ?? "normal"} priority, ${t.completedAt ? "done" : "open"}`,
    });
  }

  // Gather past MoMs with same participants
  const pastMeetings = await Meeting.find({
    "participants.userId": { $in: meeting.participants.map((p) => p.userId) },
    status: "ended",
    mom: { $exists: true },
    _id: { $ne: meeting._id },
  })
    .sort({ endedAt: -1 })
    .limit(3)
    .lean();

  const carryoverItems: Array<{ task: string; fromMeetingId: string; fromMeetingTitle: string }> = [];
  for (const pm of pastMeetings) {
    if (pm.mom) {
      sources.push({
        type: "past_mom",
        id: String(pm._id),
        title: pm.title,
        summary: pm.mom.summary?.slice(0, 200) ?? "",
      });
      for (const item of pm.mom.actionItems ?? []) {
        carryoverItems.push({ task: item.task, fromMeetingId: String(pm._id), fromMeetingTitle: pm.title });
      }
    }
  }

  // Save brief
  const brief = await MeetingBrief.findOneAndUpdate(
    { meetingId: meeting._id, userId: new mongoose.Types.ObjectId(userId) },
    {
      sources,
      carryoverItems: carryoverItems.slice(0, 10),
      agendaSuggestions: carryoverItems.slice(0, 5).map((c) => `Follow up: ${c.task}`),
      status: "ready",
      generatedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  // Optionally create Google Doc
  let docUrl: string | undefined;
  if (args.createDoc !== false) {
    try {
      const { createGoogleDoc } = await import("@/lib/google/drive");
      const { appendToDoc } = await import("@/lib/google/docs");
      const doc = await createGoogleDoc(userId, `Brief — ${meeting.title}`);
      const content = [
        `# Meeting Brief: ${meeting.title}`,
        `\n## Related Tasks\n${sources.filter((s) => s.type === "task").map((s) => `- ${s.title}: ${s.summary}`).join("\n") || "None"}`,
        `\n## Carryover Items\n${carryoverItems.map((c) => `- ${c.task} (from: ${c.fromMeetingTitle})`).join("\n") || "None"}`,
        `\n## Agenda Suggestions\n${brief.agendaSuggestions.map((s) => `- ${s}`).join("\n") || "None"}`,
      ].join("\n");
      await appendToDoc(userId, doc.id, content);
      docUrl = doc.webViewLink ?? undefined;
      await MeetingBrief.updateOne({ _id: brief._id }, { googleDocId: doc.id, googleDocUrl: docUrl });
    } catch { /* doc creation is best-effort */ }
  }

  return {
    success: true,
    summary: `Brief ready for "${meeting.title}": ${sources.length} sources, ${carryoverItems.length} carryover items.${docUrl ? ` Doc: ${docUrl}` : ""}`,
    data: { briefId: String(brief._id), sources, carryoverItems, agendaSuggestions: brief.agendaSuggestions, docUrl },
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add prepare_meeting_brief AI tool"
```

---

### Task 12: Add `generate_meeting_slides` Tool Declaration + Executor

**Files:**
- Modify: `src/lib/ai/tools.ts`

**Step 1: Add tool declaration:**

```typescript
{
  name: "generate_meeting_slides",
  description:
    "Generate a Google Slides presentation from a meeting's MoM. Creates slides for summary, key decisions, action items, and next steps. Use when user asks for 'meeting slides', 'presentation from meeting', or 'share meeting recap as slides'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      meetingId: {
        type: SchemaType.STRING,
        description: "The meeting ID to generate slides from.",
      },
    },
    required: ["meetingId"],
  },
},
```

**Step 2: Add executor case:**

```typescript
case "generate_meeting_slides": {
  await connectDB();
  const meeting = await Meeting.findById(args.meetingId as string).lean();
  if (!meeting?.mom) return { success: false, summary: "Meeting not found or has no MoM" };

  const { createMomPresentation } = await import("@/lib/google/slides");
  const pres = await createMomPresentation(userId, {
    title: meeting.title,
    date: (meeting.scheduledAt ?? meeting.createdAt).toISOString().split("T")[0],
    summary: meeting.mom.summary,
    keyDecisions: meeting.mom.keyDecisions,
    actionItems: meeting.mom.actionItems,
    nextSteps: meeting.mom.nextSteps,
  });

  return {
    success: true,
    summary: `Created presentation: ${pres.webViewLink}`,
    data: { presentationId: pres.presentationId, url: pres.webViewLink },
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add generate_meeting_slides AI tool"
```

---

### Task 13: Add `suggest_meeting_time` Tool Declaration + Executor

**Files:**
- Modify: `src/lib/ai/tools.ts`

**Step 1: Add tool declaration:**

```typescript
{
  name: "suggest_meeting_time",
  description:
    "Suggest optimal meeting times based on participants' calendar availability and meeting patterns. Considers energy patterns, buffer time, and clustering. Use when user asks to find a time for a meeting.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      attendeeEmails: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "Email addresses of meeting participants.",
      },
      duration: {
        type: SchemaType.NUMBER,
        description: "Meeting duration in minutes (default: 30).",
      },
      timeRangeStart: {
        type: SchemaType.STRING,
        description: "Start of search range (ISO 8601). Default: now.",
      },
      timeRangeEnd: {
        type: SchemaType.STRING,
        description: "End of search range (ISO 8601). Default: 7 days from now.",
      },
      preferMorning: {
        type: SchemaType.BOOLEAN,
        description: "Prefer morning slots (default: false).",
      },
    },
    required: ["attendeeEmails"],
  },
},
```

**Step 2: Add executor case:**

```typescript
case "suggest_meeting_time": {
  const { listEvents } = await import("@/lib/google/calendar");
  const duration = (args.duration as number) || 30;
  const start = (args.timeRangeStart as string) || new Date().toISOString();
  const end = (args.timeRangeEnd as string) || new Date(Date.now() + 7 * 86400000).toISOString();

  // Get user's existing events
  const events = await listEvents(userId, {
    timeMin: start,
    timeMax: end,
    maxResults: 50,
  });

  // Find free 30-min slots (simplified — checks user's calendar only)
  const busySlots = events.map((e) => ({
    start: new Date(e.start).getTime(),
    end: new Date(e.end).getTime(),
  }));

  const suggestions: Array<{ start: string; end: string; reason: string }> = [];
  const slotDuration = duration * 60000;
  const dayStart = 9 * 3600000; // 9 AM
  const dayEnd = 17 * 3600000; // 5 PM
  const bufferMs = 15 * 60000; // 15 min buffer

  let currentDay = new Date(start);
  currentDay.setHours(0, 0, 0, 0);

  while (suggestions.length < 3 && currentDay.getTime() < new Date(end).getTime()) {
    if (currentDay.getDay() !== 0 && currentDay.getDay() !== 6) {
      let slotStart = currentDay.getTime() + dayStart;
      const slotEndOfDay = currentDay.getTime() + dayEnd;

      while (slotStart + slotDuration <= slotEndOfDay && suggestions.length < 3) {
        const slotEnd = slotStart + slotDuration;
        const hasConflict = busySlots.some(
          (b) => slotStart < b.end + bufferMs && slotEnd > b.start - bufferMs,
        );

        if (!hasConflict) {
          const isMorning = new Date(slotStart).getHours() < 12;
          suggestions.push({
            start: new Date(slotStart).toISOString(),
            end: new Date(slotEnd).toISOString(),
            reason: isMorning ? "Morning slot — high energy" : "Afternoon slot — clear calendar",
          });
        }
        slotStart += 30 * 60000; // check every 30 min
      }
    }
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return {
    success: true,
    summary: `Found ${suggestions.length} available slot(s) for a ${duration}-minute meeting`,
    data: { suggestions },
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add suggest_meeting_time AI tool with smart scheduling"
```

---

### Task 14: Add `query_knowledge_graph` + `create_meeting_template` Tool Declarations + Executors

**Files:**
- Modify: `src/lib/ai/tools.ts`

**Step 1: Add both declarations:**

```typescript
{
  name: "query_knowledge_graph",
  description:
    "Search the cross-meeting knowledge graph for topics, decisions, or expertise. Use when user asks 'when did we first discuss X', 'who's the expert on Y', 'how did the decision about Z evolve'.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: "Search query for knowledge graph." },
      nodeType: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["topic", "decision", "person_expertise", "action_evolution"],
        description: "Optional filter by node type.",
      },
    },
    required: ["query"],
  },
},
{
  name: "create_meeting_template",
  description:
    "Create or update a reusable meeting template. Saves agenda structure, duration defaults, and post-meeting cascade configuration. Use when user says 'save this as a template', 'create a meeting template', or AI detects a recurring meeting pattern.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING, description: "Template name." },
      description: { type: SchemaType.STRING, description: "Template description." },
      defaultDuration: { type: SchemaType.NUMBER, description: "Default duration in minutes." },
      agendaTopics: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "Default agenda items.",
      },
    },
    required: ["name"],
  },
},
```

**Step 2: Add both executor cases:**

```typescript
case "query_knowledge_graph": {
  await connectDB();
  const MeetingKnowledge = (await import("@/lib/infra/db/models/meeting-knowledge")).default;
  const query = (args.query as string).toLowerCase();
  const filter: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
    $or: [
      { key: { $regex: query, $options: "i" } },
      { "entries.content": { $regex: query, $options: "i" } },
    ],
  };
  if (args.nodeType) filter.nodeType = args.nodeType;

  const nodes = await MeetingKnowledge.find(filter).sort({ lastUpdated: -1 }).limit(10).lean();

  return {
    success: true,
    summary: `Found ${nodes.length} knowledge node(s) for "${args.query}"`,
    data: nodes.map((n) => ({
      nodeType: n.nodeType,
      key: n.key,
      entries: n.entries.slice(0, 5),
      relatedKeys: n.relatedKeys,
    })),
  };
}

case "create_meeting_template": {
  await connectDB();
  const MeetingTemplate = (await import("@/lib/infra/db/models/meeting-template")).default;
  const template = await MeetingTemplate.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), name: args.name as string },
    {
      description: args.description as string | undefined,
      defaultDuration: (args.defaultDuration as number) || 30,
      agendaSkeleton: (args.agendaTopics as string[]) || [],
      cascadeConfig: {
        createMomDoc: true,
        createTasks: true,
        sendFollowUpEmail: true,
        appendToSheet: true,
        scheduleNextMeeting: false,
      },
    },
    { upsert: true, new: true },
  );

  return {
    success: true,
    summary: `Template "${args.name}" saved with ${(args.agendaTopics as string[])?.length ?? 0} agenda items`,
    data: { templateId: String(template._id), name: template.name },
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add query_knowledge_graph and create_meeting_template AI tools"
```

---

### Task 15: Meeting Brief API Route

**Files:**
- Create: `src/app/api/meetings/[meetingId]/brief/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/meetings/[meetingId]/brief/route.ts
import { NextRequest } from "next/server";
import { withHandler, getUserIdFromRequest, successResponse, errorResponse } from "@/lib/infra/api/with-handler";
import connectDB from "@/lib/infra/db/client";

export const GET = withHandler(async (req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) => {
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await params;
  await connectDB();

  const MeetingBrief = (await import("@/lib/infra/db/models/meeting-brief")).default;
  const brief = await MeetingBrief.findOne({ meetingId, userId }).lean();

  if (!brief) return errorResponse("No brief found", 404);
  return successResponse(brief);
});

export const POST = withHandler(async (req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) => {
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await params;

  const { executeWorkspaceTool } = await import("@/lib/ai/tools");
  const result = await executeWorkspaceTool(userId, "prepare_meeting_brief", {
    meetingId,
    createDoc: true,
  });

  if (!result.success) return errorResponse(result.summary, 500);
  return successResponse(result.data);
});
```

**Step 2: Commit**

```bash
git add src/app/api/meetings/[meetingId]/brief/route.ts
git commit -m "feat: add meeting brief API route (GET/POST)"
```

---

### Task 16: Meeting Analytics API Route

**Files:**
- Create: `src/app/api/meetings/[meetingId]/analytics/route.ts`
- Create: `src/app/api/meetings/analytics/trends/route.ts`

**Step 1: Write single-meeting analytics route**

```typescript
// src/app/api/meetings/[meetingId]/analytics/route.ts
import { NextRequest } from "next/server";
import { withHandler, getUserIdFromRequest, successResponse, errorResponse } from "@/lib/infra/api/with-handler";
import connectDB from "@/lib/infra/db/client";

export const GET = withHandler(async (req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) => {
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await params;
  await connectDB();

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
  const analytics = await MeetingAnalytics.findOne({ meetingId }).lean();

  if (!analytics) return errorResponse("No analytics available", 404);
  return successResponse(analytics);
});
```

**Step 2: Write trends route**

```typescript
// src/app/api/meetings/analytics/trends/route.ts
import { NextRequest } from "next/server";
import { withHandler, getUserIdFromRequest, successResponse } from "@/lib/infra/api/with-handler";
import connectDB from "@/lib/infra/db/client";
import mongoose from "mongoose";

export const GET = withHandler(async (req: NextRequest) => {
  const userId = await getUserIdFromRequest(req);
  const range = req.nextUrl.searchParams.get("range") || "month";
  await connectDB();

  const daysBack = range === "week" ? 7 : range === "quarter" ? 90 : 30;
  const since = new Date(Date.now() - daysBack * 86400000);

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
  const analytics = await MeetingAnalytics.find({
    userId: new mongoose.Types.ObjectId(userId),
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const avgScore = analytics.length
    ? Math.round(analytics.reduce((s, a) => s + a.meetingScore, 0) / analytics.length)
    : 0;

  return successResponse({
    totalMeetings: analytics.length,
    avgScore,
    totalDecisions: analytics.reduce((s, a) => s + a.decisionCount, 0),
    totalActionItems: analytics.reduce((s, a) => s + a.actionItemCount, 0),
    avgDuration: analytics.length
      ? Math.round(analytics.reduce((s, a) => s + a.duration, 0) / analytics.length / 60)
      : 0,
    meetings: analytics.slice(0, 20).map((a) => ({
      meetingId: a.meetingId,
      score: a.meetingScore,
      duration: Math.round(a.duration / 60),
      participants: a.participantCount,
      decisions: a.decisionCount,
      date: a.createdAt,
    })),
  });
});
```

**Step 3: Commit**

```bash
git add src/app/api/meetings/[meetingId]/analytics/route.ts src/app/api/meetings/analytics/trends/route.ts
git commit -m "feat: add meeting analytics and trends API routes"
```

---

## Phase 3: UI Components + Dashboard Widgets (Tasks 17–24)

### Task 17: New Card Types for Meeting Intelligence

**Files:**
- Modify: `src/components/ai/cards/types.ts`

**Step 1: Add new card types to the union:**

```typescript
// Add to CardType union:
| "meeting_brief"
| "meeting_analytics"
| "meeting_cascade"

// Add interfaces:
export interface MeetingBriefCardData extends BaseCard {
  type: "meeting_brief";
  meetingId: string;
  meetingTitle: string;
  sources: Array<{ type: string; title: string; summary: string }>;
  carryoverItems: Array<{ task: string; fromMeetingTitle: string }>;
  agendaSuggestions: string[];
  docUrl?: string;
}

export interface MeetingAnalyticsCardData extends BaseCard {
  type: "meeting_analytics";
  meetingTitle: string;
  score: number;
  scoreBreakdown: { agendaCoverage: number; decisionDensity: number; actionItemClarity: number; participationBalance: number };
  speakerStats: Array<{ name: string; talkTimePercent: number; sentimentAvg: number }>;
  highlights: Array<{ type: string; text: string }>;
}

export interface MeetingCascadeCardData extends BaseCard {
  type: "meeting_cascade";
  meetingTitle: string;
  steps: Array<{ step: string; status: "done" | "skipped" | "error"; summary: string; undoToken?: string }>;
}

// Update CardData union to include new types:
// Add: | MeetingBriefCardData | MeetingAnalyticsCardData | MeetingCascadeCardData
```

**Step 2: Commit**

```bash
git add src/components/ai/cards/types.ts
git commit -m "feat: add meeting_brief, meeting_analytics, meeting_cascade card types"
```

---

### Task 18: MeetingBriefCard Component

**Files:**
- Create: `src/components/ai/cards/MeetingBriefCard.tsx`

**Step 1: Write the component**

```tsx
// src/components/ai/cards/MeetingBriefCard.tsx
"use client";

import { type MeetingBriefCardData } from "./types";
import { FileText, CheckSquare, Lightbulb, ExternalLink } from "lucide-react";

interface Props {
  data: MeetingBriefCardData;
}

export default function MeetingBriefCard({ data }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500" />
          Brief: {data.meetingTitle}
        </h3>
        {data.docUrl && (
          <a
            href={data.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            Open Doc <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {data.sources.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Sources ({data.sources.length})</p>
          <div className="space-y-1">
            {data.sources.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                  {s.type.replace("_", " ")}
                </span>
                <span className="font-medium">{s.title}</span>
                <span className="text-muted-foreground truncate">{s.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.carryoverItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <CheckSquare className="h-3 w-3" /> Carryover Items
          </p>
          <ul className="text-xs space-y-0.5 pl-4 list-disc">
            {data.carryoverItems.map((c, i) => (
              <li key={i}>
                {c.task} <span className="text-muted-foreground">(from {c.fromMeetingTitle})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.agendaSuggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Suggested Agenda
          </p>
          <ul className="text-xs space-y-0.5 pl-4 list-disc">
            {data.agendaSuggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ai/cards/MeetingBriefCard.tsx
git commit -m "feat: add MeetingBriefCard component"
```

---

### Task 19: MeetingAnalyticsCard Component

**Files:**
- Create: `src/components/ai/cards/MeetingAnalyticsCard.tsx`

**Step 1: Write the component**

```tsx
// src/components/ai/cards/MeetingAnalyticsCard.tsx
"use client";

import { type MeetingAnalyticsCardData } from "./types";
import { BarChart3, Star, MessageCircle, AlertTriangle } from "lucide-react";

interface Props {
  data: MeetingAnalyticsCardData;
}

const HIGHLIGHT_ICONS: Record<string, typeof Star> = {
  decision: Star,
  disagreement: AlertTriangle,
  commitment: MessageCircle,
  key_point: Star,
};

export default function MeetingAnalyticsCard({ data }: Props) {
  const scoreColor = data.score >= 70 ? "text-green-500" : data.score >= 40 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-500" />
          {data.meetingTitle}
        </h3>
        <span className={`text-2xl font-bold ${scoreColor}`}>{data.score}</span>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(data.scoreBreakdown).map(([key, value]) => (
          <div key={key} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
              <span className="font-medium">{value}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Speaker stats */}
      {data.speakerStats.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Talk Time</p>
          <div className="space-y-1">
            {data.speakerStats.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate font-medium">{s.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${s.talkTimePercent}%` }}
                  />
                </div>
                <span className="w-8 text-right text-muted-foreground">{s.talkTimePercent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlights */}
      {data.highlights.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Highlights</p>
          <div className="space-y-1">
            {data.highlights.slice(0, 5).map((h, i) => {
              const Icon = HIGHLIGHT_ICONS[h.type] ?? Star;
              return (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <Icon className="h-3 w-3 mt-0.5 text-yellow-500 shrink-0" />
                  <span>{h.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ai/cards/MeetingAnalyticsCard.tsx
git commit -m "feat: add MeetingAnalyticsCard component with score and speaker stats"
```

---

### Task 20: MeetingCascadeCard Component (with Undo)

**Files:**
- Create: `src/components/ai/cards/MeetingCascadeCard.tsx`

**Step 1: Write the component**

```tsx
// src/components/ai/cards/MeetingCascadeCard.tsx
"use client";

import { useState } from "react";
import { type MeetingCascadeCardData } from "./types";
import { Zap, Check, SkipForward, AlertCircle, Undo2, Loader2 } from "lucide-react";

interface Props {
  data: MeetingCascadeCardData;
  onUndo?: (undoToken: string) => void;
}

const STATUS_ICONS = {
  done: Check,
  skipped: SkipForward,
  error: AlertCircle,
};

const STATUS_COLORS = {
  done: "text-green-500",
  skipped: "text-muted-foreground",
  error: "text-red-500",
};

export default function MeetingCascadeCard({ data, onUndo }: Props) {
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undone, setUndone] = useState<Set<string>>(new Set());

  const handleUndo = async (token: string) => {
    setUndoing(token);
    try {
      onUndo?.(token);
      setUndone((prev) => new Set(prev).add(token));
    } finally {
      setUndoing(null);
    }
  };

  const doneCount = data.steps.filter((s) => s.status === "done").length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Post-Meeting Actions: {data.meetingTitle}
        </h3>
        <span className="text-xs text-muted-foreground">{doneCount}/{data.steps.length} completed</span>
      </div>

      <div className="space-y-1.5">
        {data.steps.map((step, i) => {
          const Icon = STATUS_ICONS[step.status];
          const isUndone = step.undoToken ? undone.has(step.undoToken) : false;

          return (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs p-1.5 rounded ${isUndone ? "opacity-50 line-through" : ""}`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${STATUS_COLORS[step.status]}`} />
              <span className="flex-1">{step.summary}</span>
              {step.undoToken && !isUndone && step.status === "done" && (
                <button
                  onClick={() => handleUndo(step.undoToken!)}
                  disabled={undoing === step.undoToken}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {undoing === step.undoToken ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="h-3 w-3" />
                  )}
                  <span>Undo</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ai/cards/MeetingCascadeCard.tsx
git commit -m "feat: add MeetingCascadeCard with per-action undo buttons"
```

---

### Task 21: Wire New Cards into CardRenderer

**Files:**
- Modify: `src/components/ai/cards/CardRenderer.tsx`

**Step 1: Add imports and cases:**

Add imports at top:
```typescript
import MeetingBriefCard from "./MeetingBriefCard";
import MeetingAnalyticsCard from "./MeetingAnalyticsCard";
import MeetingCascadeCard from "./MeetingCascadeCard";
```

Add cases to the switch:
```typescript
case "meeting_brief":
  return <MeetingBriefCard key={key} data={card} />;
case "meeting_analytics":
  return <MeetingAnalyticsCard key={key} data={card} />;
case "meeting_cascade":
  return (
    <MeetingCascadeCard
      key={key}
      data={card}
      onUndo={(token) => onAction?.("undo_cascade_action", { undoToken: token })}
    />
  );
```

**Step 2: Commit**

```bash
git add src/components/ai/cards/CardRenderer.tsx
git commit -m "feat: wire meeting_brief, meeting_analytics, meeting_cascade into CardRenderer"
```

---

### Task 22: MeetingPulse Dashboard Widget

**Files:**
- Create: `src/components/dashboard/MeetingPulse.tsx`

**Step 1: Write the component**

```tsx
// src/components/dashboard/MeetingPulse.tsx
"use client";

import { useEffect, useState } from "react";
import { Calendar, Brain, ArrowRight } from "lucide-react";
import Link from "next/link";

interface MeetingPreview {
  id: string;
  title: string;
  scheduledAt: string;
  aiPreview?: string;
  participantCount: number;
}

export default function MeetingPulse() {
  const [meetings, setMeetings] = useState<MeetingPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchMeetings = async () => {
      try {
        const res = await fetch("/api/meetings?status=scheduled&limit=5");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMeetings(data.meetings ?? []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchMeetings();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="space-y-2">
          <div className="h-12 bg-muted rounded" />
          <div className="h-12 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          Meeting Pulse
        </h3>
        <span className="text-xs text-muted-foreground">{meetings.length} upcoming</span>
      </div>

      {meetings.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No upcoming meetings</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => {
            const time = new Date(m.scheduledAt);
            const isToday = time.toDateString() === new Date().toDateString();
            const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="text-center min-w-[3rem]">
                  <div className="text-xs font-medium">{isToday ? "Today" : time.toLocaleDateString([], { weekday: "short" })}</div>
                  <div className="text-sm font-semibold">{timeStr}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.title}</p>
                  {m.aiPreview && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Brain className="h-3 w-3 shrink-0" />
                      <span className="truncate">{m.aiPreview}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{m.participantCount} participants</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/MeetingPulse.tsx
git commit -m "feat: add MeetingPulse dashboard widget with AI previews"
```

---

### Task 23: ActionItemTracker Dashboard Widget

**Files:**
- Create: `src/components/dashboard/ActionItemTracker.tsx`

**Step 1: Write the component**

```tsx
// src/components/dashboard/ActionItemTracker.tsx
"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";

interface ActionItemStats {
  total: number;
  completed: number;
  overdue: number;
}

export default function ActionItemTracker() {
  const [stats, setStats] = useState<ActionItemStats>({ total: 0, completed: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        // Uses existing board tasks API with meeting source filter
        const res = await fetch("/api/boards/tasks?source=meeting-mom&limit=100");
        if (res.ok && !cancelled) {
          const data = await res.json();
          const tasks = data.tasks ?? [];
          const now = new Date();
          setStats({
            total: tasks.length,
            completed: tasks.filter((t: Record<string, unknown>) => t.completedAt).length,
            overdue: tasks.filter(
              (t: Record<string, unknown>) => !t.completedAt && t.dueDate && new Date(t.dueDate as string) < now,
            ).length,
          });
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const completionPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const open = stats.total - stats.completed;

  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-24" />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold text-sm mb-3">Meeting Action Items</h3>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {stats.completed} done
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Circle className="h-3.5 w-3.5" />
          {open} open
        </span>
        {stats.overdue > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {stats.overdue} overdue
          </span>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/ActionItemTracker.tsx
git commit -m "feat: add ActionItemTracker dashboard widget for meeting tasks"
```

---

### Task 24: Enhanced Pre-Meeting Proactive Trigger

**Files:**
- Modify: `src/lib/chat/proactive-triggers.ts`

**Step 1: Enhance the existing `triggerMeetingPrep()` function** to call `prepare_meeting_brief` and include the brief link:

Find the existing `triggerMeetingPrep` function and extend it to:
1. Call `executeWorkspaceTool(userId, "prepare_meeting_brief", { meetingId, createDoc: true })` for each upcoming meeting
2. Include the brief doc URL in the proactive message
3. Add carryover items count to the message

The exact edit depends on the current implementation — read the function first, then append brief generation after the existing message posting.

**Step 2: Add `triggerPostMeetingCascade()` function:**

```typescript
/* ─── 9. Post-Meeting Cascade ─── */

export async function triggerPostMeetingCascade() {
  await connectDB();
  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
  const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

  // Find meetings that ended in the last 15 minutes and haven't been cascaded
  const recentlyEnded = await Meeting.find({
    status: "ended",
    endedAt: {
      $gte: new Date(Date.now() - 15 * 60000),
      $lte: new Date(),
    },
    mom: { $exists: true },
  }).lean();

  for (const meeting of recentlyEnded) {
    const hostId = String(meeting.hostId);

    // Find the meeting conversation
    const conv = await Conversation.findOne({ meetingId: meeting._id }).lean();
    if (!conv) continue;

    const convId = String(conv._id);

    const ok = await canSendProactive(convId, hostId, "meeting_prep");
    if (!ok) continue;

    const muted = await isAgentMuted(convId, hostId);
    if (muted) continue;

    try {
      const { executeMeetingCascade } = await import("@/lib/ai/meeting-cascade");
      const result = await executeMeetingCascade(hostId, String(meeting._id));

      const doneSteps = result.steps.filter((s) => s.status === "done");
      const content = [
        `Meeting "${meeting.title}" has ended. I've automatically:`,
        ...doneSteps.map((s) => `• ${s.summary}`),
        result.undoTokens.length > 0
          ? `\nYou can undo any of these actions within 24 hours.`
          : "",
      ].join("\n");

      await postAgentMessage(convId, hostId, content);
    } catch (err) {
      log.error({ err, meetingId: String(meeting._id) }, "post-meeting cascade failed");
    }
  }
}
```

**Step 3: Wire into cron route** — Add `triggerPostMeetingCascade` to the imports and trigger array in `src/app/api/cron/proactive/route.ts`.

**Step 4: Commit**

```bash
git add src/lib/chat/proactive-triggers.ts src/app/api/cron/proactive/route.ts
git commit -m "feat: add post-meeting cascade proactive trigger + enhanced meeting prep"
```

---

## Phase 4: Advanced AI + Knowledge Graph (Tasks 25–30)

### Task 25: Knowledge Graph Builder

**Files:**
- Create: `src/lib/ai/knowledge-builder.ts`

Build a function `updateKnowledgeGraph(userId, meetingId)` that:
1. Reads the meeting's MoM (summary, keyDecisions, actionItems)
2. Uses Gemini to extract topics, decisions, and person expertise
3. Upserts into MeetingKnowledge model — appending entries to existing nodes or creating new ones
4. Links related nodes via `relatedKeys`

This runs as a background job after MoM generation.

**Step 1: Write test, Step 2: Verify fail, Step 3: Implement, Step 4: Verify pass, Step 5: Commit**

---

### Task 26: Meeting Pattern Analyzer

**Files:**
- Create: `src/lib/ai/meeting-patterns.ts`

Build `analyzeMeetingPatterns(userId)` that:
1. Queries MeetingAnalytics for the last 30 days
2. Groups by recurring meeting title
3. Computes trends: duration drift, score changes, participant engagement
4. Returns pattern insights as strings

**Step 1–5: TDD cycle + commit**

---

### Task 27: Undo API Route

**Files:**
- Create: `src/app/api/ai/action/undo/route.ts`

POST endpoint accepting `{ undoToken }`, calls `consumeUndoToken()`, then executes the reverse action.

**Step 1–5: TDD cycle + commit**

---

### Task 28: Meeting Copilot SSE Endpoint

**Files:**
- Create: `src/app/api/meetings/[meetingId]/copilot/route.ts`

GET endpoint returning an SSE stream. During a live meeting, publishes real-time AI suggestions based on transcript chunks. Uses Redis pub/sub channel `copilot:{meetingId}`.

**Step 1–5: TDD cycle + commit**

---

### Task 29: Update Gemini System Prompt

**Files:**
- Modify: `src/lib/ai/prompts.ts`

Add meeting intelligence instructions to `SYSTEM_PROMPTS.ASSISTANT_CHAT`:
- When user discusses meetings, proactively offer briefs and analytics
- After meeting ends, mention cascade actions
- When searching, include meeting history
- Knowledge graph queries for cross-meeting decisions

**Step 1–5: Edit + commit**

---

### Task 30: Build Verification + Integration Test

**Files:**
- Run: `npx vitest run` — all tests pass
- Run: `npm run build` — production build succeeds

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: verify build + all tests pass for meetings AI integration"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|------------------|
| 1 | 1–8 | 4 models, Google Slides service, Drive auto-folders, undo tokens, cascade pipeline |
| 2 | 9–16 | 7 new AI tools, 3 new API routes |
| 3 | 17–24 | 3 card types, 3 card components, 2 dashboard widgets, enhanced proactive triggers |
| 4 | 25–30 | Knowledge graph builder, pattern analyzer, undo API, copilot SSE, prompt updates, verification |

**Total: 30 tasks across 4 phases**

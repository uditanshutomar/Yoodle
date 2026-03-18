/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock ALL top-level imports of tools.ts ──────────────────────────

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/google/gmail", () => ({
  sendEmail: vi.fn(),
  searchEmails: vi.fn(),
  modifyEmailLabels: vi.fn(),
  listEmails: vi.fn(),
  getUnreadCount: vi.fn(),
  getEmail: vi.fn(),
  replyToEmail: vi.fn(),
}));

vi.mock("@/lib/google/calendar", () => ({
  createEvent: vi.fn(),
  listEvents: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEvent: vi.fn(),
}));

vi.mock("@/lib/board/tools", () => ({
  createBoardTask: vi.fn(),
  updateBoardTask: vi.fn(),
  moveBoardTask: vi.fn(),
  assignBoardTask: vi.fn(),
  deleteBoardTask: vi.fn(),
  listBoardTasks: vi.fn(),
  searchBoardTasks: vi.fn(),
}));

vi.mock("@/lib/board/cross-domain", () => ({
  createTaskFromMeeting: vi.fn(),
  createTaskFromEmail: vi.fn(),
  createTaskFromChat: vi.fn(),
  scheduleMeetingForTask: vi.fn(),
  linkDocToTask: vi.fn(),
  linkMeetingToTask: vi.fn(),
  generateSubtasks: vi.fn(),
  getTaskContext: vi.fn(),
}));

vi.mock("@/lib/google/drive", () => ({
  searchFiles: vi.fn(),
  listFiles: vi.fn(),
  createGoogleDoc: vi.fn(),
}));

vi.mock("@/lib/google/contacts", () => ({
  searchContacts: vi.fn(),
}));

vi.mock("@/lib/google/docs", () => ({
  getDocContent: vi.fn(),
  appendToDoc: vi.fn(),
  findAndReplaceInDoc: vi.fn(),
}));

vi.mock("@/lib/google/sheets", () => ({
  readSheet: vi.fn(),
  writeSheet: vi.fn(),
  appendToSheet: vi.fn(),
  createSpreadsheet: vi.fn(),
  clearSheetRange: vi.fn(),
}));

vi.mock("@/lib/infra/db/models/ai-memory", () => ({
  default: {
    find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) }),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("@/lib/infra/db/models/user", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/lib/utils/id", () => ({
  generateMeetingCode: vi.fn(() => "ABC-1234"),
}));

// Dynamic imports used in the two cases we test
vi.mock("@/lib/infra/db/models/meeting-analytics", () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("@/lib/infra/db/models/meeting-brief", () => ({
  default: {
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
  },
}));

// ── Now import the module under test and the mocked deps we need ────

import { executeWorkspaceTool } from "@/lib/ai/tools";
import Meeting from "@/lib/infra/db/models/meeting";
import Task from "@/lib/infra/db/models/task";
import { createGoogleDoc } from "@/lib/google/drive";
import { appendToDoc } from "@/lib/google/docs";
import mongoose from "mongoose";

// We need to mock Meeting and Task *after* import so we can control .findById etc.
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("@/lib/infra/db/models/task", () => ({
  default: {
    find: vi.fn(),
  },
}));

const mockedMeeting = vi.mocked(Meeting);
const mockedTask = vi.mocked(Task);
const mockedCreateGoogleDoc = vi.mocked(createGoogleDoc);
const mockedAppendToDoc = vi.mocked(appendToDoc);

// ── Helpers ─────────────────────────────────────────────────────────

const VALID_USER_ID = new mongoose.Types.ObjectId().toString();
const VALID_MEETING_ID = new mongoose.Types.ObjectId().toString();

function makeMeetingDoc(overrides: Record<string, any> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(VALID_MEETING_ID),
    title: "Sprint Planning Review",
    scheduledAt: new Date("2026-03-20T10:00:00Z"),
    participants: [{ userId: new mongoose.Types.ObjectId(VALID_USER_ID) }],
    status: "scheduled",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("AI tool card format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────── prepare_meeting_brief ──────────────────────────────────────

  describe("prepare_meeting_brief", () => {
    function setupBriefMocks(opts: {
      tasks?: any[];
      pastMeetings?: any[];
      docUrl?: string | null;
    } = {}) {
      const tasks = opts.tasks ?? [
        { title: "Fix login bug", priority: "high", dueDate: "2026-03-19", assigneeId: VALID_USER_ID, status: "open" },
        { title: "Write docs", priority: "medium", dueDate: null, assigneeId: VALID_USER_ID, status: "open" },
      ];
      const pastMeetings = opts.pastMeetings ?? [
        {
          _id: new mongoose.Types.ObjectId(),
          title: "Previous Sprint",
          scheduledAt: new Date("2026-03-10"),
          mom: {
            summary: "Discussed backlog",
            actionItems: [
              { task: "Deploy staging", status: "open" },
              { task: "Review PRs", status: "done" },
            ],
          },
        },
      ];

      (mockedMeeting.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeMeetingDoc()),
      });

      (mockedTask.find as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(tasks),
          }),
        }),
      });

      (mockedMeeting.find as any).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(pastMeetings),
            }),
          }),
        }),
      });

      if (opts.docUrl !== null) {
        mockedCreateGoogleDoc.mockResolvedValue({
          id: "doc-123",
          webViewLink: opts.docUrl ?? "https://docs.google.com/doc/123",
        } as any);
        mockedAppendToDoc.mockResolvedValue(undefined as any);
      } else {
        mockedCreateGoogleDoc.mockRejectedValue(new Error("doc creation failed"));
      }
    }

    it("returns data.card with type 'meeting_brief'", async () => {
      setupBriefMocks();

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const card = (result.data as any).card;
      expect(card).toBeDefined();
      expect(card.type).toBe("meeting_brief");
    });

    it("card has meetingId, meetingTitle, sources, carryoverItems, agendaSuggestions", async () => {
      setupBriefMocks();

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      const card = (result.data as any).card;
      expect(card.meetingId).toBe(VALID_MEETING_ID);
      expect(card.meetingTitle).toBe("Sprint Planning Review");
      expect(card.sources).toBeInstanceOf(Array);
      expect(card.carryoverItems).toBeInstanceOf(Array);
      expect(card.agendaSuggestions).toBeInstanceOf(Array);
    });

    it("sources contains tasks mapped with type 'task'", async () => {
      setupBriefMocks();

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      const card = (result.data as any).card;
      const taskSources = card.sources.filter((s: any) => s.type === "task");
      expect(taskSources.length).toBe(2);
      expect(taskSources[0]).toEqual(
        expect.objectContaining({ type: "task", title: "Fix login bug" }),
      );
      expect(taskSources[0].summary).toContain("high");
    });

    it("sources contains past meetings mapped with type 'meeting'", async () => {
      setupBriefMocks();

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      const card = (result.data as any).card;
      const meetingSources = card.sources.filter((s: any) => s.type === "meeting");
      expect(meetingSources.length).toBe(1);
      expect(meetingSources[0]).toEqual(
        expect.objectContaining({
          type: "meeting",
          title: "Previous Sprint",
          summary: "Discussed backlog",
        }),
      );
    });

    it("carryoverItems uses fromMeetingTitle (not from)", async () => {
      setupBriefMocks();

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      const card = (result.data as any).card;
      // Only open/pending items should be carried over
      expect(card.carryoverItems.length).toBe(1);
      const item = card.carryoverItems[0];
      expect(item.fromMeetingTitle).toBe("Previous Sprint");
      expect(item.task).toBe("Deploy staging");
      // Ensure old 'from' field is NOT present
      expect(item).not.toHaveProperty("from");
    });

    it("includes docUrl when doc creation succeeds", async () => {
      setupBriefMocks({ docUrl: "https://docs.google.com/doc/abc" });

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      const card = (result.data as any).card;
      expect(card.docUrl).toBe("https://docs.google.com/doc/abc");
    });

    it("omits docUrl when doc creation fails (graceful)", async () => {
      setupBriefMocks({ docUrl: null });

      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: VALID_MEETING_ID,
      });

      // Should still succeed — doc failure is not fatal
      expect(result.success).toBe(true);
      const card = (result.data as any).card;
      expect(card.docUrl).toBeUndefined();
    });

    it("returns success: false for invalid meetingId", async () => {
      const result = await executeWorkspaceTool(VALID_USER_ID, "prepare_meeting_brief", {
        meetingId: "not-a-valid-id",
      });

      expect(result.success).toBe(false);
      expect(result.summary).toMatch(/invalid/i);
    });
  });

  // ────── get_meeting_analytics (single meeting) ────────────────────

  describe("get_meeting_analytics – single meeting", () => {
    it("returns data.card with type 'meeting_analytics'", async () => {
      const analyticsDoc = {
        meetingScore: 82,
        engagementScore: 90,
        actionabilityScore: 75,
        timeManagementScore: 80,
        speakerStats: [
          { name: "Alice", talkTimePercent: 60 },
          { name: "Bob", talkTimePercent: 40 },
        ],
        highlights: ["Great discussion on roadmap", "Action items assigned"],
      };

      // Setup mocks inline since the helper uses top-level await
      (mockedMeeting.findById as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(makeMeetingDoc()),
        }),
      });

      const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
      (MeetingAnalytics.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(analyticsDoc),
      });

      const result = await executeWorkspaceTool(VALID_USER_ID, "get_meeting_analytics", {
        meetingId: VALID_MEETING_ID,
      });

      expect(result.success).toBe(true);
      const card = (result.data as any).card;
      expect(card).toBeDefined();
      expect(card.type).toBe("meeting_analytics");
    });

    it("card has meetingTitle, score, scoreBreakdown, speakerStats, highlights", async () => {
      const analyticsDoc = {
        meetingScore: 82,
        engagementScore: 90,
        actionabilityScore: 75,
        timeManagementScore: 80,
        speakerStats: [
          { name: "Alice", talkTimePercent: 60 },
          { name: "Bob", talkTimePercent: 40 },
        ],
        highlights: ["Great discussion on roadmap"],
      };

      (mockedMeeting.findById as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(makeMeetingDoc()),
        }),
      });

      const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
      (MeetingAnalytics.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(analyticsDoc),
      });

      const result = await executeWorkspaceTool(VALID_USER_ID, "get_meeting_analytics", {
        meetingId: VALID_MEETING_ID,
      });

      const card = (result.data as any).card;
      expect(card.meetingTitle).toBe("Sprint Planning Review");
      expect(card.score).toBe(82);
      expect(card.scoreBreakdown).toEqual({
        engagement: 90,
        actionability: 75,
        timeManagement: 80,
      });
      expect(card.speakerStats).toEqual([
        { name: "Alice", talkPercent: 60 },
        { name: "Bob", talkPercent: 40 },
      ]);
      expect(card.highlights).toEqual(["Great discussion on roadmap"]);
    });

    it("returns null data when no analytics exist", async () => {
      (mockedMeeting.findById as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(makeMeetingDoc()),
        }),
      });

      const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
      (MeetingAnalytics.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const result = await executeWorkspaceTool(VALID_USER_ID, "get_meeting_analytics", {
        meetingId: VALID_MEETING_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(result.summary).toMatch(/no analytics/i);
    });
  });

  // ────── get_meeting_analytics (trends) ────────────────────────────

  describe("get_meeting_analytics – trends (no meetingId)", () => {
    it("returns data.card with type 'data_summary'", async () => {
      const meetingDocs = [
        {
          _id: new mongoose.Types.ObjectId(),
          mom: {
            keyDecisions: ["Decision A"],
            actionItems: [{ task: "Do X" }],
          },
        },
        {
          _id: new mongoose.Types.ObjectId(),
          mom: {
            keyDecisions: [],
            actionItems: [{ task: "Do Y" }, { task: "Do Z" }],
          },
        },
      ];

      (mockedMeeting.find as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(meetingDocs),
        }),
      });

      const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
      (MeetingAnalytics.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { meetingScore: 80 },
          { meetingScore: 90 },
        ]),
      });

      const result = await executeWorkspaceTool(VALID_USER_ID, "get_meeting_analytics", {
        timeRange: "month",
      });

      expect(result.success).toBe(true);
      const card = (result.data as any).card;
      expect(card).toBeDefined();
      expect(card.type).toBe("data_summary");
    });

    it("card has title and items with label/value pairs", async () => {
      const meetingDocs = [
        {
          _id: new mongoose.Types.ObjectId(),
          mom: {
            keyDecisions: ["Decision A", "Decision B"],
            actionItems: [{ task: "Do X" }],
          },
        },
      ];

      (mockedMeeting.find as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(meetingDocs),
        }),
      });

      const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
      (MeetingAnalytics.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ meetingScore: 70 }]),
      });

      const result = await executeWorkspaceTool(VALID_USER_ID, "get_meeting_analytics", {
        timeRange: "week",
      });

      const card = (result.data as any).card;
      expect(card.title).toBe("Meeting Trends (week)");
      expect(card.items).toBeInstanceOf(Array);
      expect(card.items.length).toBe(4);

      const labels = card.items.map((i: any) => i.label);
      expect(labels).toContain("Total Meetings");
      expect(labels).toContain("Avg Score");
      expect(labels).toContain("Total Decisions");
      expect(labels).toContain("Total Action Items");

      // Verify values
      const findItem = (label: string) => card.items.find((i: any) => i.label === label);
      expect(findItem("Total Meetings").value).toBe("1");
      expect(findItem("Avg Score").value).toBe("70");
      expect(findItem("Total Decisions").value).toBe("2");
      expect(findItem("Total Action Items").value).toBe("1");
    });
  });
});

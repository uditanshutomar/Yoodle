import { describe, it, expect, vi, beforeEach } from "vitest";

/* ─── Mocks ─── */

const mockConnectDB = vi.fn().mockResolvedValue(undefined);
const mockFindById = vi.fn();

vi.mock("@/lib/infra/db/client", () => ({
  default: () => mockConnectDB(),
}));

const mockMeetingUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findById: (...args: unknown[]) => ({
      select: () => ({
        populate: () => ({
          lean: () => mockFindById(...args),
        }),
      }),
    }),
    updateOne: (...args: unknown[]) => mockMeetingUpdateOne(...args),
  },
}));

const mockUserFind = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    find: (...args: unknown[]) => ({
      lean: () => mockUserFind(...args),
    }),
    findById: vi.fn(),
  },
}));

const mockCreateGoogleDoc = vi.fn();
const mockGetOrCreateMeetingFolder = vi.fn();
vi.mock("@/lib/google/drive", () => ({
  createGoogleDoc: (...args: unknown[]) => mockCreateGoogleDoc(...args),
  getOrCreateMeetingFolder: (...args: unknown[]) => mockGetOrCreateMeetingFolder(...args),
}));

const mockAppendToDoc = vi.fn();
vi.mock("@/lib/google/docs", () => ({
  appendToDoc: (...args: unknown[]) => mockAppendToDoc(...args),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/google/gmail", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockAppendToSheet = vi.fn();
vi.mock("@/lib/google/sheets", () => ({
  appendToSheet: (...args: unknown[]) => mockAppendToSheet(...args),
}));

const mockCreateTaskFromMeeting = vi.fn();
vi.mock("@/lib/board/cross-domain", () => ({
  createTaskFromMeeting: (...args: unknown[]) => mockCreateTaskFromMeeting(...args),
}));

const mockStoreUndoToken = vi.fn();
vi.mock("@/lib/ai/meeting-undo", () => ({
  storeUndoToken: (...args: unknown[]) => mockStoreUndoToken(...args),
}));

const mockUpdateKnowledgeGraph = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/ai/knowledge-builder", () => ({
  updateKnowledgeGraph: (...args: unknown[]) => mockUpdateKnowledgeGraph(...args),
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { executeMeetingCascade } from "@/lib/ai/meeting-cascade";
import type { CascadeResult } from "@/lib/ai/meeting-cascade";

/* ─── Fixtures ─── */

const MEETING_ID = "meeting-abc-123";
const USER_ID = "user-xyz-789";

const baseMeeting = {
  _id: MEETING_ID,
  title: "Sprint Retro",
  scheduledAt: new Date("2026-03-15T10:00:00Z"),
  participants: [
    { userId: "u1", role: "host" },
    { userId: "u2", role: "participant" },
  ],
  mom: {
    summary: "We discussed sprint results.",
    keyPoints: ["Velocity improved", "QA bottleneck"],
    actionItems: [
      { task: "Fix CI pipeline", owner: "Alice", due: "2026-03-20" },
    ],
    decisions: ["Adopt new testing framework"],
  },
};

/* ─── Tests ─── */

describe("executeMeetingCascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockFindById.mockResolvedValue(baseMeeting);
    mockGetOrCreateMeetingFolder.mockResolvedValue({ id: "folder-1", name: "Sprint Retro", webViewLink: "https://drive.google.com/drive/folders/folder-1" });
    mockCreateGoogleDoc.mockResolvedValue({ id: "doc-1", name: "MoM — Sprint Retro", webViewLink: "https://docs.google.com/document/d/doc-1/edit" });
    mockAppendToDoc.mockResolvedValue({ documentId: "doc-1" });
    mockCreateTaskFromMeeting.mockResolvedValue({
      success: true,
      summary: 'Created 1 task(s) from meeting "Sprint Retro": Fix CI pipeline',
      data: { count: 1, tasks: ["Fix CI pipeline"] },
    });
    mockUserFind.mockResolvedValue([
      { _id: "u1", email: "alice@test.com" },
      { _id: "u2", email: "bob@test.com" },
    ]);
    mockSendEmail.mockResolvedValue({ messageId: "msg-1", threadId: "thread-1" });
    mockAppendToSheet.mockResolvedValue({ updatedRows: 1 });
    mockStoreUndoToken.mockImplementation((_uid: string, payload: Record<string, unknown>) =>
      Promise.resolve(`undo_${payload.action}`),
    );
  });

  it("exports executeMeetingCascade as a function", () => {
    expect(typeof executeMeetingCascade).toBe("function");
  });

  it("returns a CascadeResult with steps array and undoTokens array", async () => {
    const result: CascadeResult = await executeMeetingCascade(USER_ID, MEETING_ID);

    expect(result.meetingId).toBe(MEETING_ID);
    expect(Array.isArray(result.steps)).toBe(true);
    expect(Array.isArray(result.undoTokens)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("handles missing meeting gracefully", async () => {
    mockFindById.mockResolvedValue(null);

    const result = await executeMeetingCascade(USER_ID, "nonexistent-id");

    expect(result.meetingId).toBe("nonexistent-id");

    const loadStep = result.steps.find((s) => s.step === "load_meeting");
    expect(loadStep).toBeDefined();
    expect(loadStep!.status).toBe("error");
    expect(loadStep!.summary).toContain("not found");

    // Should still have a notify step at the end
    const notifyStep = result.steps[result.steps.length - 1];
    expect(notifyStep.step).toBe("notify");
  });

  it("runs all 5 pipeline steps on a full meeting", async () => {
    const result = await executeMeetingCascade(USER_ID, MEETING_ID, {
      analyticsSheetId: "sheet-1",
    });

    const stepNames = result.steps.map((s) => s.step);
    expect(stepNames).toEqual([
      "create_mom_doc",
      "create_tasks",
      "send_followup",
      "append_sheet",
      "notify",
    ]);

    expect(result.steps[0].status).toBe("done");
    expect(result.steps[1].status).toBe("done");
    expect(result.steps[2].status).toBe("done");
    expect(result.steps[3].status).toBe("done");
    expect(result.steps[4].status).toBe("done");
  });

  it("collects undo tokens from steps that produce them", async () => {
    const result = await executeMeetingCascade(USER_ID, MEETING_ID);

    // create_mom_doc, create_tasks, send_followup all produce tokens
    // Tokens may be mock-generated ("undo_<action>") or real ("undo:<nanoid>")
    expect(result.undoTokens.length).toBe(3);
    for (const token of result.undoTokens) {
      expect(token).toMatch(/^undo[_:]/);
    }
  });

  it("skips steps listed in skipSteps", async () => {
    const result = await executeMeetingCascade(USER_ID, MEETING_ID, {
      skipSteps: ["create_mom_doc", "send_followup"],
    });

    const momStep = result.steps.find((s) => s.step === "create_mom_doc");
    expect(momStep!.status).toBe("skipped");
    expect(momStep!.summary).toContain("Skipped by user");

    const followupStep = result.steps.find((s) => s.step === "send_followup");
    expect(followupStep!.status).toBe("skipped");

    // create_tasks should still run
    const tasksStep = result.steps.find((s) => s.step === "create_tasks");
    expect(tasksStep!.status).toBe("done");
  });

  it("skips append_sheet when no analyticsSheetId provided", async () => {
    const result = await executeMeetingCascade(USER_ID, MEETING_ID);

    const sheetStep = result.steps.find((s) => s.step === "append_sheet");
    expect(sheetStep!.status).toBe("skipped");
    expect(sheetStep!.summary).toContain("No analytics sheet ID");
  });

  it("continues execution when a step throws an error", async () => {
    mockCreateGoogleDoc.mockRejectedValue(new Error("Drive API down"));

    const result = await executeMeetingCascade(USER_ID, MEETING_ID);

    const momStep = result.steps.find((s) => s.step === "create_mom_doc");
    expect(momStep!.status).toBe("error");
    expect(momStep!.summary).toContain("Drive API down");

    // Subsequent steps should still run
    const tasksStep = result.steps.find((s) => s.step === "create_tasks");
    expect(tasksStep!.status).toBe("done");

    const followupStep = result.steps.find((s) => s.step === "send_followup");
    expect(followupStep!.status).toBe("done");
  });

  it("calls onProgress callback for each step", async () => {
    const progressSteps: string[] = [];

    await executeMeetingCascade(USER_ID, MEETING_ID, {
      onProgress: (step) => progressSteps.push(step.step),
    });

    expect(progressSteps).toEqual([
      "create_mom_doc",
      "create_tasks",
      "send_followup",
      "append_sheet",
      "notify",
    ]);
  });

  it("skips create_mom_doc when meeting has no MoM", async () => {
    mockFindById.mockResolvedValue({ ...baseMeeting, mom: undefined });

    const result = await executeMeetingCascade(USER_ID, MEETING_ID);

    const momStep = result.steps.find((s) => s.step === "create_mom_doc");
    expect(momStep!.status).toBe("skipped");
    expect(momStep!.summary).toContain("No MoM data");
  });

  it("notify step summarizes results correctly", async () => {
    mockCreateGoogleDoc.mockRejectedValue(new Error("fail"));

    const result = await executeMeetingCascade(USER_ID, MEETING_ID);

    const notifyStep = result.steps[result.steps.length - 1];
    expect(notifyStep.step).toBe("notify");
    expect(notifyStep.status).toBe("done");
    expect(notifyStep.summary).toMatch(/\d+ done/);
    expect(notifyStep.summary).toMatch(/\d+ error/);
  });

  /* ─── Artifact Tests ─── */

  it("returns artifacts from create_mom_doc step", async () => {
    const result = await executeMeetingCascade(USER_ID, MEETING_ID);
    const momStep = result.steps.find((s) => s.step === "create_mom_doc");
    expect(momStep!.artifacts).toBeDefined();
    expect(momStep!.artifacts!.momDocId).toBe("doc-1");
    expect(momStep!.artifacts!.momDocUrl).toBe("https://docs.google.com/document/d/doc-1/edit");
    expect(momStep!.artifacts!.folderId).toBe("folder-1");
    expect(momStep!.artifacts!.folderUrl).toBe("https://drive.google.com/drive/folders/folder-1");
  });

  it("persists artifacts on Meeting model after cascade completes", async () => {
    await executeMeetingCascade(USER_ID, MEETING_ID);
    expect(mockMeetingUpdateOne).toHaveBeenCalledWith(
      { _id: MEETING_ID },
      { $set: { artifacts: expect.objectContaining({ momDocId: "doc-1", folderId: "folder-1" }) } },
    );
  });

  it("does not call Meeting.updateOne for artifacts when no steps produce artifacts", async () => {
    mockFindById.mockResolvedValue({ ...baseMeeting, mom: undefined });
    await executeMeetingCascade(USER_ID, MEETING_ID);
    // Check updateOne was NOT called with artifacts (it may be called for other reasons)
    const artifactCalls = mockMeetingUpdateOne.mock.calls.filter(
      (call) => call[1]?.$set?.artifacts,
    );
    expect(artifactCalls.length).toBe(0);
  });

  /* ─── Knowledge Graph Tests ─── */

  it("calls updateKnowledgeGraph when meeting has MoM", async () => {
    await executeMeetingCascade(USER_ID, MEETING_ID);
    expect(mockUpdateKnowledgeGraph).toHaveBeenCalledWith(USER_ID, MEETING_ID);
  });

  it("does not call updateKnowledgeGraph when meeting has no MoM", async () => {
    mockFindById.mockResolvedValue({ ...baseMeeting, mom: undefined });
    await executeMeetingCascade(USER_ID, MEETING_ID);
    expect(mockUpdateKnowledgeGraph).not.toHaveBeenCalled();
  });

  it("continues cascade when updateKnowledgeGraph throws", async () => {
    mockUpdateKnowledgeGraph.mockRejectedValue(new Error("KB failure"));
    const result = await executeMeetingCascade(USER_ID, MEETING_ID);
    // Cascade should still complete with all steps
    expect(result.steps.length).toBeGreaterThanOrEqual(4);
    const tasksStep = result.steps.find((s) => s.step === "create_tasks");
    expect(tasksStep!.status).toBe("done");
  });
});

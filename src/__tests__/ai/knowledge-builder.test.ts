import { describe, it, expect, vi, beforeEach } from "vitest";

/* ─── Mocks ─── */

const mockConnectDB = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/infra/db/client", () => ({
  default: () => mockConnectDB(),
}));

const mockFindById = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findById: (...args: unknown[]) => ({
      populate: () => ({
        lean: () => mockFindById(...args),
      }),
    }),
  },
}));

const mockUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });
vi.mock("@/lib/infra/db/models/meeting-knowledge", () => ({
  default: {
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { updateKnowledgeGraph } from "@/lib/ai/knowledge-builder";

/* ─── Fixtures ─── */

const USER_ID = "user-123";
const MEETING_ID = "meeting-456";

const baseMeeting = {
  _id: MEETING_ID,
  title: "Sprint Planning",
  scheduledAt: new Date("2026-03-15T10:00:00Z"),
  createdAt: new Date("2026-03-14T10:00:00Z"),
  participants: [
    { userId: "p1" },
    { userId: "p2" },
  ],
  mom: {
    summary: "We discussed sprint goals. The team reviewed backlog items.",
    keyDecisions: ["Adopt TypeScript strict mode", "Move to biweekly sprints"],
    discussionPoints: ["CI pipeline improvements", "Code review process"],
    actionItems: [
      { task: "Set up TypeScript strict config", owner: "Alice", due: "2026-03-20" },
      { task: "Draft new sprint cadence proposal", owner: "Bob", due: "2026-03-22" },
    ],
    nextSteps: ["Follow up next week"],
  },
};

/* ─── Tests ─── */

describe("updateKnowledgeGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue(baseMeeting);
  });

  it("exports updateKnowledgeGraph as a function", () => {
    expect(typeof updateKnowledgeGraph).toBe("function");
  });

  it("connects to DB and loads the meeting", async () => {
    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    expect(mockConnectDB).toHaveBeenCalled();
    expect(mockFindById).toHaveBeenCalledWith(MEETING_ID);
  });

  it("returns early if meeting not found", async () => {
    mockFindById.mockResolvedValue(null);

    await updateKnowledgeGraph(USER_ID, "nonexistent");

    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("returns early if meeting has no MoM", async () => {
    mockFindById.mockResolvedValue({ ...baseMeeting, mom: undefined });

    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it("upserts decision nodes for each key decision", async () => {
    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    const decisionCalls = mockUpdateOne.mock.calls.filter(
      (call: unknown[]) => (call[0] as Record<string, unknown>).nodeType === "decision",
    );

    expect(decisionCalls.length).toBe(2);
    expect(decisionCalls[0][0]).toMatchObject({
      userId: USER_ID,
      nodeType: "decision",
    });
    // Key should be first 5 words lowercase
    expect(decisionCalls[0][0].key).toBe("adopt typescript strict mode");
  });

  it("upserts action_evolution nodes for each action item", async () => {
    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    const actionCalls = mockUpdateOne.mock.calls.filter(
      (call: unknown[]) => (call[0] as Record<string, unknown>).nodeType === "action_evolution",
    );

    expect(actionCalls.length).toBe(2);
    expect(actionCalls[0][0]).toMatchObject({
      userId: USER_ID,
      nodeType: "action_evolution",
    });
    // Key should be task text lowercase truncated to 50 chars
    expect(actionCalls[0][0].key).toBe("set up typescript strict config");
  });

  it("upserts person_expertise nodes for participants when decisions exist", async () => {
    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    const personCalls = mockUpdateOne.mock.calls.filter(
      (call: unknown[]) => (call[0] as Record<string, unknown>).nodeType === "person_expertise",
    );

    expect(personCalls.length).toBe(2); // 2 participants
    expect(personCalls[0][0]).toMatchObject({
      userId: USER_ID,
      nodeType: "person_expertise",
    });
  });

  it("uses $push for entries and $addToSet for relatedKeys", async () => {
    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    // Check the update operation structure for the first call
    const firstCall = mockUpdateOne.mock.calls[0];
    const updateOp = firstCall[1] as Record<string, unknown>;

    expect(updateOp).toHaveProperty("$push");
    expect(updateOp).toHaveProperty("$addToSet");
    expect((updateOp.$push as Record<string, unknown>).entries).toBeDefined();
    expect((updateOp.$addToSet as Record<string, unknown>).relatedKeys).toBeDefined();
  });

  it("sets upsert: true on all updateOne calls", async () => {
    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    for (const call of mockUpdateOne.mock.calls) {
      const options = call[2] as Record<string, unknown>;
      expect(options.upsert).toBe(true);
    }
  });

  it("skips person_expertise when no decisions exist", async () => {
    mockFindById.mockResolvedValue({
      ...baseMeeting,
      mom: { ...baseMeeting.mom, keyDecisions: [] },
    });

    await updateKnowledgeGraph(USER_ID, MEETING_ID);

    const personCalls = mockUpdateOne.mock.calls.filter(
      (call: unknown[]) => (call[0] as Record<string, unknown>).nodeType === "person_expertise",
    );

    expect(personCalls.length).toBe(0);
  });

  it("continues processing when a single upsert fails", async () => {
    mockUpdateOne
      .mockResolvedValueOnce({ acknowledged: true })
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValue({ acknowledged: true });

    // Should not throw
    await expect(
      updateKnowledgeGraph(USER_ID, MEETING_ID),
    ).resolves.toBeUndefined();

    // Should have attempted all upserts despite the error
    expect(mockUpdateOne.mock.calls.length).toBeGreaterThan(2);
  });
});

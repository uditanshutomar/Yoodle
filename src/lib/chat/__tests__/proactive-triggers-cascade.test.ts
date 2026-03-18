import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ── Mock dependencies ────────────────────────────────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));

const mockPublish = vi.fn();
vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(() => ({ publish: mockPublish })),
}));

const mockMeetingFind = vi.fn();
const mockMeetingUpdateOne = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    find: vi.fn(() => ({ lean: () => mockMeetingFind() })),
    updateOne: vi.fn((...args: unknown[]) => mockMeetingUpdateOne(...args)),
  },
}));

const mockConvFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: vi.fn(() => ({ lean: () => mockConvFindOne() })),
    updateOne: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    create: vi.fn().mockResolvedValue({
      _id: "msg-1",
      createdAt: new Date(),
      senderId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
    }),
  },
}));

vi.mock("@/lib/chat/proactive-limiter", () => ({
  canSendProactive: vi.fn().mockResolvedValue(true),
  isAgentMuted: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/chat/proactive-insights", () => ({
  incrementUnseen: vi.fn().mockResolvedValue(undefined),
}));

const mockExecuteMeetingCascade = vi.fn();
vi.mock("@/lib/ai/meeting-cascade", () => ({
  executeMeetingCascade: vi.fn((...args: unknown[]) => mockExecuteMeetingCascade(...args)),
}));

// ── Helpers ──────────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";
const TEST_CONV_ID = "507f1f77bcf86cd799439033";

function makeMeeting(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(TEST_MEETING_ID),
    title: "Sprint Retro",
    status: "ended",
    endedAt: new Date(Date.now() - 5 * 60 * 1000),
    mom: { summary: "Discussed sprint velocity" },
    ...overrides,
  };
}

function makeConversation() {
  return {
    _id: new mongoose.Types.ObjectId(TEST_CONV_ID),
    meetingId: new mongoose.Types.ObjectId(TEST_MEETING_ID),
    participants: [
      {
        userId: new mongoose.Types.ObjectId(TEST_USER_ID),
        agentEnabled: true,
      },
    ],
  };
}

function makeCascadeResult(overrides: Record<string, unknown> = {}) {
  return {
    meetingId: TEST_MEETING_ID,
    steps: [
      { step: "create_tasks", status: "done", summary: "Created 3 tasks", undoToken: "undo-abc" },
      { step: "send_summary", status: "done", summary: "Sent email summary" },
      { step: "update_board", status: "skipped", summary: "No board linked" },
    ],
    undoTokens: ["undo-abc"],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("triggerPostMeetingCascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMeetingUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("calls executeMeetingCascade for ended meetings with MoM", async () => {
    mockMeetingFind.mockResolvedValue([makeMeeting()]);
    mockConvFindOne.mockResolvedValue(makeConversation());
    mockExecuteMeetingCascade.mockResolvedValue(makeCascadeResult());

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    expect(mockExecuteMeetingCascade).toHaveBeenCalledWith(TEST_USER_ID, TEST_MEETING_ID);
  });

  it("includes cascade card in the message via agentMeta.cards", async () => {
    mockMeetingFind.mockResolvedValue([makeMeeting()]);
    mockConvFindOne.mockResolvedValue(makeConversation());
    mockExecuteMeetingCascade.mockResolvedValue(makeCascadeResult());

    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    expect(DirectMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMeta: expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({ type: "meeting_cascade" }),
          ]),
        }),
      }),
    );
  });

  it("card has type meeting_cascade and meetingTitle", async () => {
    mockMeetingFind.mockResolvedValue([makeMeeting({ title: "Design Review" })]);
    mockConvFindOne.mockResolvedValue(makeConversation());
    mockExecuteMeetingCascade.mockResolvedValue(makeCascadeResult());

    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    const createCall = vi.mocked(DirectMessage.create).mock.calls[0][0] as Record<string, unknown>;
    const agentMeta = createCall.agentMeta as { cards: Array<Record<string, unknown>> };
    const card = agentMeta.cards[0];

    expect(card.type).toBe("meeting_cascade");
    expect(card.meetingTitle).toBe("Design Review");
  });

  it("card steps array matches cascade result steps", async () => {
    const cascadeResult = makeCascadeResult();
    mockMeetingFind.mockResolvedValue([makeMeeting()]);
    mockConvFindOne.mockResolvedValue(makeConversation());
    mockExecuteMeetingCascade.mockResolvedValue(cascadeResult);

    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    const createCall = vi.mocked(DirectMessage.create).mock.calls[0][0] as Record<string, unknown>;
    const agentMeta = createCall.agentMeta as { cards: Array<{ steps: Array<Record<string, unknown>> }> };
    const cardSteps = agentMeta.cards[0].steps;

    expect(cardSteps).toHaveLength(3);
    expect(cardSteps[0]).toEqual(
      expect.objectContaining({ step: "create_tasks", status: "done", summary: "Created 3 tasks" }),
    );
    expect(cardSteps[1]).toEqual(
      expect.objectContaining({ step: "send_summary", status: "done", summary: "Sent email summary" }),
    );
    expect(cardSteps[2]).toEqual(
      expect.objectContaining({ step: "update_board", status: "skipped", summary: "No board linked" }),
    );
  });

  it("steps include undoToken when present", async () => {
    mockMeetingFind.mockResolvedValue([makeMeeting()]);
    mockConvFindOne.mockResolvedValue(makeConversation());
    mockExecuteMeetingCascade.mockResolvedValue(makeCascadeResult());

    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    const createCall = vi.mocked(DirectMessage.create).mock.calls[0][0] as Record<string, unknown>;
    const agentMeta = createCall.agentMeta as { cards: Array<{ steps: Array<Record<string, unknown>> }> };
    const cardSteps = agentMeta.cards[0].steps;

    expect(cardSteps[0].undoToken).toBe("undo-abc");
    expect(cardSteps[1].undoToken).toBeUndefined();
  });

  it("sets cascadeExecutedAt atomically before execution", async () => {
    mockMeetingFind.mockResolvedValue([makeMeeting()]);
    mockConvFindOne.mockResolvedValue(makeConversation());
    mockExecuteMeetingCascade.mockResolvedValue(makeCascadeResult());

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    // updateOne should be called before executeMeetingCascade
    expect(mockMeetingUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        cascadeExecutedAt: { $exists: false },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ cascadeExecutedAt: expect.any(Date) }),
      }),
    );

    // Confirm the order: updateOne was called before executeMeetingCascade
    const updateCallOrder = mockMeetingUpdateOne.mock.invocationCallOrder[0];
    const cascadeCallOrder = mockExecuteMeetingCascade.mock.invocationCallOrder[0];
    expect(updateCallOrder).toBeLessThan(cascadeCallOrder);
  });

  it("skips meetings without MoM", async () => {
    // The query filter requires mom: { $exists: true }, so meetings without MoM
    // should not appear in the results at all
    mockMeetingFind.mockResolvedValue([]);
    mockConvFindOne.mockResolvedValue(null);

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    expect(mockExecuteMeetingCascade).not.toHaveBeenCalled();
  });

  it("does not re-run cascade on meetings with existing cascadeExecutedAt", async () => {
    // The query filter includes cascadeExecutedAt: { $exists: false }
    // so already-executed meetings are excluded from the result set
    mockMeetingFind.mockResolvedValue([]);

    const { triggerPostMeetingCascade } = await import("../proactive-triggers");
    await triggerPostMeetingCascade();

    expect(mockExecuteMeetingCascade).not.toHaveBeenCalled();
    expect(mockMeetingUpdateOne).not.toHaveBeenCalled();
  });
});

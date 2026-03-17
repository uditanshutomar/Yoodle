import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));

const mockMeetingFindById = vi.fn();
const mockDMFind = vi.fn();
const mockTaskFind = vi.fn();

vi.mock("@/lib/infra/db/models/meeting", () => ({ default: { findById: mockMeetingFindById } }));
vi.mock("@/lib/infra/db/models/direct-message", () => ({ default: { find: mockDMFind } }));
vi.mock("@/lib/infra/db/models/task", () => ({ default: { find: mockTaskFind } }));

import { enrichTask, enrichMeeting } from "../context-enricher";

describe("context-enricher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enrichTask returns relatedMessages and sourceMeeting when no meetingId", async () => {
    mockDMFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await enrichTask({ _id: "task1", title: "Test task" });
    expect(result).toHaveProperty("relatedMessages");
    expect(result).toHaveProperty("sourceMeeting");
    expect(result.sourceMeeting).toBeNull();
    expect(result.relatedMessages).toEqual([]);
  });

  it("enrichTask returns source meeting when meetingId present", async () => {
    mockMeetingFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "meet1",
        title: "Sprint Planning",
        scheduledAt: new Date("2026-03-17T10:00:00Z"),
      }),
    });
    mockDMFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await enrichTask({ _id: "task1", title: "Test", meetingId: "meet1" });
    expect(result.sourceMeeting).not.toBeNull();
    expect(result.sourceMeeting!.title).toBe("Sprint Planning");
  });

  it("enrichMeeting returns relatedTasks", async () => {
    mockTaskFind.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: "t1", title: "Task 1", completedAt: null },
          { _id: "t2", title: "Task 2", completedAt: new Date() },
        ]),
      }),
    });

    const result = await enrichMeeting({ _id: "meet1", title: "Standup" });
    expect(result.relatedTasks).toHaveLength(2);
    expect(result.relatedTasks[0].status).toBe("open");
    expect(result.relatedTasks[1].status).toBe("done");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/db/models/board", () => {
  const find = vi.fn();
  return { default: { find } };
});
vi.mock("@/lib/infra/db/models/task", () => {
  const find = vi.fn();
  const countDocuments = vi.fn();
  return { default: { find, countDocuments } };
});

import { buildBoardContext } from "../context";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";

describe("buildBoardContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty context when user has no boards", async () => {
    (Board.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: () => Promise.resolve([]),
    });

    const result = await buildBoardContext("user123");
    expect(result.contextXml).toBe("");
    expect(result.taskCount).toBe(0);
    expect(result.overdueCount).toBe(0);
    expect(result.taskIds).toEqual([]);
  });

  it("builds XML context with tasks sorted by urgency", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const tomorrow = new Date(now.getTime() + 86400000);

    (Board.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: () => Promise.resolve([
        {
          _id: "board1",
          title: "Personal",
          scope: "personal",
          columns: [
            { id: "col1", title: "To Do" },
            { id: "col2", title: "In Progress" },
          ],
        },
      ]),
    });

    (Task.find as ReturnType<typeof vi.fn>).mockReturnValue({
      populate: () => ({
        lean: () => Promise.resolve([
          {
            _id: "task1",
            boardId: "board1",
            columnId: "col2",
            title: "Overdue task",
            priority: "high",
            dueDate: yesterday,
            assigneeId: { _id: "user123", displayName: "You" },
            subtasks: [],
            meetingId: null,
          },
          {
            _id: "task2",
            boardId: "board1",
            columnId: "col1",
            title: "Tomorrow task",
            priority: "medium",
            dueDate: tomorrow,
            assigneeId: { _id: "user123", displayName: "You" },
            subtasks: [{ done: true }, { done: false }],
            meetingId: null,
          },
        ]),
      }),
    });

    const result = await buildBoardContext("user123");
    expect(result.taskCount).toBe(2);
    expect(result.overdueCount).toBe(1);
    expect(result.taskIds).toEqual(["task1", "task2"]);
    expect(result.contextXml).toContain("<board-tasks>");
    expect(result.contextXml).toContain('overdue="true"');
    expect(result.contextXml).toContain('title="Overdue task"');
    expect(result.contextXml).toContain('subtasks-done="1"');
  });
});

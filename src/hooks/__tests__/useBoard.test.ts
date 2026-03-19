// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBoard } from "../useBoard";

/* ─── Helpers ─── */

function jsonResponse(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

const BOARD_ID = "board-1";

const fakeBoard = {
  _id: BOARD_ID,
  title: "Sprint Board",
  columns: [{ id: "col-1", title: "Todo", color: "#ccc", position: 0 }],
  labels: [],
  members: [],
};

const fakeTasks = [
  {
    _id: "task-1",
    boardId: BOARD_ID,
    columnId: "col-1",
    position: 0,
    title: "Task One",
    priority: "medium" as const,
    labels: [],
    subtasks: [],
    createdAt: "2025-01-01",
  },
  {
    _id: "task-2",
    boardId: BOARD_ID,
    columnId: "col-1",
    position: 1,
    title: "Task Two",
    priority: "low" as const,
    labels: [],
    subtasks: [],
    createdAt: "2025-01-02",
  },
];

/* ─── Tests ─── */

describe("useBoard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockInitialLoad() {
    fetchMock.mockImplementation((url: string) => {
      if (url === `/api/boards/${BOARD_ID}`) {
        return jsonResponse({ data: fakeBoard });
      }
      if (url === `/api/boards/${BOARD_ID}/tasks`) {
        return jsonResponse({ data: fakeTasks });
      }
      return jsonResponse({}, false, 404);
    });
  }

  it("starts with loading=true, empty tasks, null board", () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useBoard(BOARD_ID));
    expect(result.current.loading).toBe(true);
    expect(result.current.board).toBeNull();
    expect(result.current.tasks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("fetches board and tasks on mount", async () => {
    mockInitialLoad();
    const { result } = renderHook(() => useBoard(BOARD_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.board).toEqual(fakeBoard);
    expect(result.current.tasks).toEqual(fakeTasks);
    expect(result.current.error).toBeNull();
    // Called with board URL and tasks URL
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/boards/${BOARD_ID}`,
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/boards/${BOARD_ID}/tasks`,
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("does nothing when boardId is undefined", async () => {
    renderHook(() => useBoard(undefined));
    // Should stay in loading state, no fetch calls
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets error when board fetch fails", async () => {
    // Both board and tasks fail — so `setError(null)` from tasks won't clear it
    fetchMock.mockImplementation(() => jsonResponse({}, false, 500));
    const { result } = renderHook(() => useBoard(BOARD_ID));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.board).toBeNull();
  });

  describe("createTask", () => {
    it("adds a new task to state on success", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const newTask = {
        _id: "task-3",
        boardId: BOARD_ID,
        columnId: "col-1",
        position: 2,
        title: "New Task",
        priority: "high" as const,
        labels: [],
        subtasks: [],
        createdAt: "2025-01-03",
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: newTask }),
      } as Response);

      await act(async () => {
        await result.current.createTask({ title: "New Task", columnId: "col-1", priority: "high" });
      });

      expect(result.current.tasks).toHaveLength(3);
      expect(result.current.tasks[2]).toEqual(newTask);
    });

    it("sets error when create fails", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({}) } as Response);

      await act(async () => {
        await result.current.createTask({ title: "Fail", columnId: "col-1" });
      });

      expect(result.current.error).toBe("Failed to create task");
      expect(result.current.tasks).toHaveLength(2); // unchanged
    });
  });

  describe("updateTask", () => {
    it("replaces the task in state with server response", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const updatedTask = { ...fakeTasks[0], title: "Updated Title" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: updatedTask }),
      } as Response);

      await act(async () => {
        await result.current.updateTask("task-1", { title: "Updated Title" });
      });

      expect(result.current.tasks[0].title).toBe("Updated Title");
      expect(result.current.error).toBeNull();
    });

    it("sets error on update failure without modifying tasks", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);

      await act(async () => {
        await result.current.updateTask("task-1", { title: "Nope" });
      });

      expect(result.current.error).toBe("Failed to update task");
      expect(result.current.tasks[0].title).toBe("Task One"); // unchanged
    });
  });

  describe("deleteTask", () => {
    it("removes the task optimistically and keeps it removed on success", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

      await act(async () => {
        await result.current.deleteTask("task-1");
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0]._id).toBe("task-2");
    });

    it("sends DELETE request on failure without crashing", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === "DELETE") return jsonResponse({}, false, 500);
        if (typeof url === "string" && url.includes("/tasks")) return jsonResponse({ data: fakeTasks });
        if (typeof url === "string" && url.includes(`/boards/`)) return jsonResponse({ data: fakeBoard });
        return jsonResponse({}, false, 404);
      });

      await act(async () => {
        await result.current.deleteTask("task-1");
      });

      const deleteCalls = fetchMock.mock.calls.filter(
        (c: [string, ...unknown[]]) => (c[1] as { method?: string })?.method === "DELETE"
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][0]).toContain("/tasks/task-1");
    });

    it("handles network error on delete gracefully", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === "DELETE") return Promise.reject(new Error("Network error"));
        if (typeof url === "string" && url.includes("/tasks")) return jsonResponse({ data: fakeTasks });
        if (typeof url === "string" && url.includes(`/boards/`)) return jsonResponse({ data: fakeBoard });
        return jsonResponse({}, false, 404);
      });

      await act(async () => {
        await result.current.deleteTask("task-1");
      });

      // Hook still functional after error
      expect(result.current.board).toBeTruthy();
    });
  });

  describe("reorderTasks", () => {
    it("does not set error on successful reorder", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

      await act(async () => {
        await result.current.reorderTasks([{ taskId: "task-1", columnId: "col-1", position: 1 }]);
      });

      expect(result.current.error).toBeNull();
    });

    it("refetches tasks on reorder failure", async () => {
      mockInitialLoad();
      const { result } = renderHook(() => useBoard(BOARD_ID));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = fetchMock.mock.calls.length;

      // Reorder fails, then refetch succeeds (board + tasks again)
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/reorder")) {
          return jsonResponse({}, false, 500);
        }
        if (typeof url === "string" && url.includes("/tasks")) {
          return jsonResponse({ data: fakeTasks });
        }
        if (typeof url === "string" && url.includes(`/boards/${BOARD_ID}`)) {
          return jsonResponse({ data: fakeBoard });
        }
        return jsonResponse({}, false, 404);
      });

      await act(async () => {
        await result.current.reorderTasks([{ taskId: "task-1", columnId: "col-1", position: 1 }]);
      });

      // Verify a refetch was triggered after the reorder call
      const callsAfter = fetchMock.mock.calls.length;
      expect(callsAfter).toBeGreaterThan(callsBefore + 1); // reorder + refetch
    });
  });
});

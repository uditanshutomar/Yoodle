// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePendingActions } from "../usePendingActions";

/* ─── Helpers ─── */

function jsonResponse(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

const sampleAction = {
  actionId: "act-1",
  actionType: "create_task",
  args: { title: "My task" },
  summary: "Create a new task",
};

/* ─── Tests ─── */

describe("usePendingActions", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts with empty actions and no error", () => {
    const { result } = renderHook(() => usePendingActions());
    expect(result.current.actions).toEqual([]);
    expect(result.current.pendingActions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  describe("addAction", () => {
    it("adds an action with pending status", () => {
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      expect(result.current.actions).toHaveLength(1);
      expect(result.current.actions[0]).toEqual({ ...sampleAction, status: "pending" });
    });

    it("prepends new actions to the list", () => {
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
        result.current.addAction({ ...sampleAction, actionId: "act-2", summary: "Second" });
      });

      expect(result.current.actions[0].actionId).toBe("act-2");
      expect(result.current.actions[1].actionId).toBe("act-1");
    });
  });

  describe("confirmAction", () => {
    it("transitions to confirmed on success", async () => {
      fetchMock.mockReturnValue(
        jsonResponse({ data: { summary: "Task created" } })
      );
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.confirmAction("act-1");
      });

      // After confirm resolves, action should be confirmed
      const confirmed = result.current.actions.find((a) => a.actionId === "act-1");
      expect(confirmed?.status).toBe("confirmed");
      expect(confirmed?.result).toBe("Task created");

      // Verify fetch was called correctly
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/action/confirm",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ actionType: "create_task", args: { title: "My task" } }),
        })
      );
    });

    it("rolls back to pending on failure", async () => {
      fetchMock.mockReturnValue(
        jsonResponse({ error: { message: "Server error" } }, false, 500)
      );
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.confirmAction("act-1");
      });

      const action = result.current.actions.find((a) => a.actionId === "act-1");
      expect(action?.status).toBe("pending");
      expect(result.current.error).toBe("Server error");
    });

    it("rolls back to pending on network error", async () => {
      fetchMock.mockRejectedValue(new Error("Network failure"));
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.confirmAction("act-1");
      });

      const action = result.current.actions.find((a) => a.actionId === "act-1");
      expect(action?.status).toBe("pending");
      expect(result.current.error).toBe("Network failure");
    });
  });

  describe("denyAction", () => {
    it("marks action as denied and excludes from pendingActions", () => {
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      act(() => {
        result.current.denyAction("act-1");
      });

      expect(result.current.actions[0].status).toBe("denied");
      // Denied actions are filtered from pendingActions
      expect(result.current.pendingActions).toHaveLength(0);
    });
  });

  describe("reviseAction", () => {
    it("updates action with revised data on success", async () => {
      fetchMock.mockReturnValue(
        jsonResponse({
          success: true,
          data: {
            actionType: "update_task",
            args: { title: "Revised task" },
            summary: "Update instead of create",
          },
        })
      );
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.reviseAction("act-1", "Actually update the task");
      });

      const action = result.current.actions.find((a) => a.actionId === "act-1");
      expect(action?.status).toBe("pending");
      expect(action?.actionType).toBe("update_task");
      expect(action?.summary).toBe("Update instead of create");
      expect(action?.args).toEqual({ title: "Revised task" });
    });

    it("rolls back to pending on revision failure", async () => {
      fetchMock.mockReturnValue(
        jsonResponse({ error: { message: "Revision failed (500)" } }, false, 500)
      );
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.reviseAction("act-1", "change it");
      });

      const action = result.current.actions.find((a) => a.actionId === "act-1");
      expect(action?.status).toBe("pending");
      expect(result.current.error).toBe("Revision failed (500)");
    });

    it("rolls back to pending on network error during revision", async () => {
      fetchMock.mockRejectedValue(new Error("Timeout"));
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.reviseAction("act-1", "change it");
      });

      const action = result.current.actions.find((a) => a.actionId === "act-1");
      expect(action?.status).toBe("pending");
      expect(result.current.error).toBe("Timeout");
    });
  });

  describe("clearError", () => {
    it("resets error to null", async () => {
      fetchMock.mockRejectedValue(new Error("fail"));
      const { result } = renderHook(() => usePendingActions());

      act(() => {
        result.current.addAction(sampleAction);
      });

      await act(async () => {
        await result.current.confirmAction("act-1");
      });

      expect(result.current.error).toBe("fail");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});

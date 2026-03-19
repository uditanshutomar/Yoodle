import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockExecuteWorkspaceTool = vi.fn();
vi.mock("@/lib/ai/tools", () => ({
  executeWorkspaceTool: (...args: unknown[]) => mockExecuteWorkspaceTool(...args),
}));

function createRequest(body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/ai/action/batch-confirm";
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const { POST } = await import("../route");

describe("POST /api/ai/action/batch-confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes batch actions and returns results", async () => {
    mockExecuteWorkspaceTool.mockResolvedValue({ success: true, summary: "Done" });

    const res = await POST(createRequest({
      actionType: "update_board_task",
      items: [
        { id: "t1", args: { title: "Updated" } },
        { id: "t2", args: { title: "Updated 2" } },
      ],
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.results).toHaveLength(2);
    expect(body.data.succeeded).toBe(2);
    expect(body.data.total).toBe(2);
    expect(mockExecuteWorkspaceTool).toHaveBeenCalledTimes(2);
    expect(mockExecuteWorkspaceTool).toHaveBeenCalledWith(
      TEST_USER_ID,
      "update_board_task",
      { title: "Updated", taskId: "t1" },
    );
  });

  it("returns 401 when not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError("Unauthorized"));

    const res = await POST(createRequest({
      actionType: "update_board_task",
      items: [{ id: "t1", args: {} }],
    }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 400 for disallowed action type", async () => {
    const res = await POST(createRequest({
      actionType: "launch_missiles",
      items: [{ id: "t1", args: {} }],
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid body (empty items)", async () => {
    const res = await POST(createRequest({
      actionType: "update_board_task",
      items: [],
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("handles partial failures gracefully", async () => {
    mockExecuteWorkspaceTool
      .mockResolvedValueOnce({ success: true, summary: "Done" })
      .mockRejectedValueOnce(new Error("DB timeout"));

    const res = await POST(createRequest({
      actionType: "delete_board_task",
      items: [
        { id: "t1", args: {} },
        { id: "t2", args: {} },
      ],
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.succeeded).toBe(1);
    expect(body.data.total).toBe(2);
    expect(body.data.results[1].success).toBe(false);
    expect(body.data.results[1].summary).toBe("DB timeout");
  });
});

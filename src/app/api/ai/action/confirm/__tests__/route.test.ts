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
  const url = "http://localhost:3000/api/ai/action/confirm";
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const { POST } = await import("../route");

describe("POST /api/ai/action/confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms a pending action successfully", async () => {
    mockExecuteWorkspaceTool.mockResolvedValue({ taskId: "t1", created: true });

    const res = await POST(createRequest({
      actionType: "create_board_task",
      args: { title: "New Task", columnId: "col-1" },
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.taskId).toBe("t1");
    expect(mockExecuteWorkspaceTool).toHaveBeenCalledWith(
      TEST_USER_ID,
      "create_board_task",
      { title: "New Task", columnId: "col-1" },
    );
  });

  it("returns 400 for unknown action type", async () => {
    const res = await POST(createRequest({
      actionType: "unknown_action",
      args: {},
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for missing actionType", async () => {
    const res = await POST(createRequest({ args: {} }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for missing args", async () => {
    const res = await POST(createRequest({ actionType: "create_board_task" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

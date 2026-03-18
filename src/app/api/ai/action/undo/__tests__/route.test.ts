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

const mockConsumeUndoToken = vi.fn();
vi.mock("@/lib/ai/meeting-undo", () => ({
  consumeUndoToken: (...args: unknown[]) => mockConsumeUndoToken(...args),
}));

const mockExecuteWorkspaceTool = vi.fn();
vi.mock("@/lib/ai/tools", () => ({
  executeWorkspaceTool: (...args: unknown[]) => mockExecuteWorkspaceTool(...args),
}));

function createRequest(body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/ai/action/undo";
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const { POST } = await import("../route");

describe("POST /api/ai/action/undo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("undoes an action successfully", async () => {
    mockConsumeUndoToken.mockResolvedValue({
      userId: TEST_USER_ID,
      action: "create_board_task",
      reverseAction: "delete_board_task",
      reverseArgs: { taskId: "t1" },
      description: "Delete task t1",
    });
    mockExecuteWorkspaceTool.mockResolvedValue({ deleted: true });

    const res = await POST(createRequest({ undoToken: "undo-tok-123" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.undone).toBe(true);
    expect(mockExecuteWorkspaceTool).toHaveBeenCalledWith(
      TEST_USER_ID,
      "delete_board_task",
      { taskId: "t1" },
    );
  });

  it("returns 400 for missing undoToken", async () => {
    const res = await POST(createRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 404 for non-existent undo token", async () => {
    mockConsumeUndoToken.mockResolvedValue(null);

    const res = await POST(createRequest({ undoToken: "bad-token" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("handles noop reverse actions", async () => {
    mockConsumeUndoToken.mockResolvedValue({
      userId: TEST_USER_ID,
      action: "send_email",
      reverseAction: "noop",
      reverseArgs: {},
      description: "Cannot unsend email",
    });

    const res = await POST(createRequest({ undoToken: "noop-tok" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.undone).toBe(true);
    expect(mockExecuteWorkspaceTool).not.toHaveBeenCalled();
  });
});

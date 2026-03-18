import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("user123"),
}));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/ai/tools", () => ({
  executeWorkspaceTool: vi.fn().mockResolvedValue({ success: true, summary: "OK" }),
}));

import { POST } from "../batch-confirm/route";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { NextRequest } from "next/server";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/ai/action/batch-confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
  });
}

describe("POST /api/ai/action/batch-confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes all items and returns results", async () => {
    const res = await POST(makeReq({
      actionType: "update_board_task",
      items: [
        { id: "t1", args: { status: "done" } },
        { id: "t2", args: { status: "done" } },
      ],
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.results).toHaveLength(2);
    expect(data.data.results[0].success).toBe(true);
    expect(executeWorkspaceTool).toHaveBeenCalledTimes(2);
  });

  it("returns partial results on mixed success/failure", async () => {
    (executeWorkspaceTool as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, summary: "OK" })
      .mockResolvedValueOnce({ success: false, summary: "Not found" });

    const res = await POST(makeReq({
      actionType: "update_board_task",
      items: [
        { id: "t1", args: { status: "done" } },
        { id: "t2", args: { status: "done" } },
      ],
    }));

    const data = await res.json();
    expect(data.data.results[0].success).toBe(true);
    expect(data.data.results[1].success).toBe(false);
  });

  it("rejects unknown action types", async () => {
    const res = await POST(makeReq({
      actionType: "drop_database",
      items: [{ id: "t1", args: {} }],
    }));
    expect(res.status).toBe(400);
  });
});

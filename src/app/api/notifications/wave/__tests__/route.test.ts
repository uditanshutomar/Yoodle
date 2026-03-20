import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

const mockFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockFindById(...args)),
      }),
    }),
  },
}));

import { POST } from "../route";
import { NextRequest } from "next/server";

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/notifications/wave", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notifications/wave", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success when waving at a valid user", async () => {
    mockFindById.mockResolvedValue({
      _id: "607f1f77bcf86cd799439022",
      name: "Target User",
    });

    const res = await POST(makeReq({ targetUserId: "607f1f77bcf86cd799439022" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.waved).toBe(true);
  });

  it("returns 400 for invalid targetUserId", async () => {
    const res = await POST(makeReq({ targetUserId: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when waving at yourself", async () => {
    const res = await POST(makeReq({ targetUserId: "607f1f77bcf86cd799439011" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 404 when target user does not exist", async () => {
    mockFindById.mockResolvedValue(null);

    const res = await POST(makeReq({ targetUserId: "607f1f77bcf86cd799439099" }));
    expect(res.status).toBe(404);
  });
});

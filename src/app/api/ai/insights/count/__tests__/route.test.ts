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

const mockGetUnseenCount = vi.fn();
const mockClearUnseen = vi.fn();
vi.mock("@/lib/chat/proactive-insights", () => ({
  getUnseenCount: (...args: unknown[]) => mockGetUnseenCount(...args),
  clearUnseen: (...args: unknown[]) => mockClearUnseen(...args),
}));

function createRequest(method: string): NextRequest {
  const url = "http://localhost:3000/api/ai/insights/count";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") headers.Origin = "http://localhost:3000";
  return new NextRequest(url, { method, headers });
}

const { GET, DELETE } = await import("../route");

describe("GET /api/ai/insights/count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the unseen insight count", async () => {
    mockGetUnseenCount.mockResolvedValue(5);

    const res = await GET(createRequest("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(5);
    expect(mockGetUnseenCount).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

describe("DELETE /api/ai/insights/count", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears the unseen count", async () => {
    mockClearUnseen.mockResolvedValue(undefined);

    const res = await DELETE(createRequest("DELETE"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(mockClearUnseen).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

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

const mockSetUserOnline = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/chat/presence", () => ({
  setUserOnline: (...args: unknown[]) => mockSetUserOnline(...args),
}));

// ── Import route handler after all mocks ──────────────────────────

const { POST } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest() {
  return new NextRequest("http://localhost:3000/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("POST /api/presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("updates user presence and returns ok", async () => {
    const res = await POST(createRequest(), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(mockSetUserOnline).toHaveBeenCalledWith(TEST_USER_ID);
  });
});

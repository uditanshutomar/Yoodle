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

const mockAggregate = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

// ── Import route handler after all mocks ──────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(url: string) {
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/users/nearby", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns nearby users in social mode", async () => {
    const fakeNearby = [
      { id: "u2", name: "Jane", displayName: "Jane", distanceKm: 1.5, mode: "social" },
    ];
    mockAggregate.mockResolvedValue(fakeNearby);

    const res = await GET(
      createRequest("http://localhost:3000/api/users/nearby?lng=-73.9&lat=40.7&radiusKm=5"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Jane");
  });

  it("returns 400 for missing coordinates", async () => {
    const res = await GET(
      createRequest("http://localhost:3000/api/users/nearby"),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

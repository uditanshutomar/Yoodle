import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const CONNECTED_USER_ID = "607f1f77bcf86cd799439022";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("server-only", () => ({}));

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

const mockConnectionFind = vi.fn();
vi.mock("@/lib/infra/db/models/connection", () => ({
  default: {
    find: (...args: unknown[]) => mockConnectionFind(...args),
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
    // Default: user has no accepted connections
    mockConnectionFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
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

  it("$geoNear query includes both social and lockin modes when user has connections", async () => {
    // User has an accepted connection
    mockConnectionFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            requesterId: { toString: () => TEST_USER_ID },
            recipientId: { toString: () => CONNECTED_USER_ID },
          },
        ]),
      }),
    });

    mockAggregate.mockResolvedValue([]);

    await GET(
      createRequest("http://localhost:3000/api/users/nearby?lng=-73.9&lat=40.7&radiusKm=5"),
      defaultContext,
    );

    expect(mockAggregate).toHaveBeenCalledTimes(1);
    const pipeline = mockAggregate.mock.calls[0][0];
    const geoNearStage = pipeline[0].$geoNear;
    const queryFilter = geoNearStage.query;

    // Should have $or with social and lockin conditions
    expect(queryFilter.$or).toBeDefined();
    expect(queryFilter.$or).toHaveLength(2);
    expect(queryFilter.$or[0]).toEqual({ mode: "social" });
    expect(queryFilter.$or[1].mode).toBe("lockin");
    expect(queryFilter.$or[1]._id.$in).toBeDefined();
  });

  it("$geoNear query only has social mode when user has no connections", async () => {
    mockAggregate.mockResolvedValue([]);

    await GET(
      createRequest("http://localhost:3000/api/users/nearby?lng=-73.9&lat=40.7&radiusKm=5"),
      defaultContext,
    );

    const pipeline = mockAggregate.mock.calls[0][0];
    const queryFilter = pipeline[0].$geoNear.query;

    expect(queryFilter.$or).toBeDefined();
    expect(queryFilter.$or).toHaveLength(1);
    expect(queryFilter.$or[0]).toEqual({ mode: "social" });
  });

  it("lockin users do not have exact coordinates exposed", async () => {
    // User has an accepted connection
    mockConnectionFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            requesterId: { toString: () => TEST_USER_ID },
            recipientId: { toString: () => CONNECTED_USER_ID },
          },
        ]),
      }),
    });

    mockAggregate.mockResolvedValue([
      {
        id: CONNECTED_USER_ID,
        name: "Bob",
        mode: "lockin",
        location: { coordinates: [-73.9, 40.7], label: "NYC" },
        distanceKm: 2.3,
      },
      {
        id: "607f1f77bcf86cd799439033",
        name: "Alice",
        mode: "social",
        location: { coordinates: [-73.8, 40.6], label: "Brooklyn" },
        distanceKm: 5.1,
      },
    ]);

    const res = await GET(
      createRequest("http://localhost:3000/api/users/nearby?lng=-73.9&lat=40.7&radiusKm=10"),
      defaultContext,
    );
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);

    // Lockin user should NOT have exact coordinates
    const lockinUser = body.data.find((u: { mode: string }) => u.mode === "lockin");
    expect(lockinUser).toBeDefined();
    expect(lockinUser.location.coordinates).toBeUndefined();
    expect(lockinUser.location.approximate).toBe(true);
    expect(lockinUser.location.blurredCoordinates).toBeDefined();
    expect(lockinUser.location.blurredCoordinates).toHaveLength(2);

    // Social user should still have coordinates
    const socialUser = body.data.find((u: { mode: string }) => u.mode === "social");
    expect(socialUser).toBeDefined();
    expect(socialUser.location.coordinates).toBeDefined();
  });

  it("$project stage includes location.coordinates", async () => {
    mockAggregate.mockResolvedValue([]);

    await GET(
      createRequest("http://localhost:3000/api/users/nearby?lng=-73.9&lat=40.7&radiusKm=5"),
      defaultContext,
    );

    const pipeline = mockAggregate.mock.calls[0][0];
    const projectStage = pipeline.find((s: Record<string, unknown>) => s.$project);
    expect(projectStage.$project.location.coordinates).toBeDefined();
  });
});

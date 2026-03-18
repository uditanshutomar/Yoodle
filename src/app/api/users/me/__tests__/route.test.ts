import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

// Mock User model
const mockFindByIdChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};

const mockFindByIdAndUpdateChain = {
  select: vi.fn().mockResolvedValue(null),
};

const mockFindById = vi.fn(() => mockFindByIdChain);
const mockFindByIdAndUpdate = vi.fn(() => mockFindByIdAndUpdateChain);

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET, PATCH } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

const fakeUser = {
  _id: { toString: () => TEST_USER_ID },
  email: "test@example.com",
  name: "Test User",
  displayName: "Testy",
  avatarUrl: "https://example.com/avatar.png",
  mode: "social",
  status: "online",
  location: null,
  preferences: { notifications: true, theme: "dark" },
  lastSeenAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function createRequest(
  method: string,
  url = "http://localhost:3000/api/users/me",
  body?: object,
) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

const defaultContext = { params: Promise.resolve({}) };

// ── GET tests ──────────────────────────────────────────────────────

describe("GET /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns user profile", async () => {
    mockFindByIdChain.lean.mockResolvedValueOnce(fakeUser);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("test@example.com");
    expect(body.data.name).toBe("Test User");
    expect(body.data.displayName).toBe("Testy");
    expect(body.data.mode).toBe("social");
  });

  it("returns 404 when user not found", async () => {
    mockFindByIdChain.lean.mockResolvedValueOnce(null);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 when not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(
      new UnauthorizedError("Missing authentication credentials."),
    );

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});

// ── PATCH tests ────────────────────────────────────────────────────

describe("PATCH /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("updates user profile name", async () => {
    const updatedUser = {
      ...fakeUser,
      name: "New Name",
    };
    mockFindByIdAndUpdateChain.select.mockResolvedValueOnce(updatedUser);

    const req = createRequest("PATCH", undefined, { name: "New Name" });
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("New Name");
  });

  it("updates user display name", async () => {
    const updatedUser = {
      ...fakeUser,
      displayName: "NewDisplay",
    };
    mockFindByIdAndUpdateChain.select.mockResolvedValueOnce(updatedUser);

    const req = createRequest("PATCH", undefined, { displayName: "NewDisplay" });
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe("NewDisplay");
  });

  it("returns 400 when no valid fields to update", async () => {
    const req = createRequest("PATCH", undefined, {});
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for name exceeding max length", async () => {
    const req = createRequest("PATCH", undefined, {
      name: "A".repeat(101),
    });
    const response = await PATCH(req, defaultContext);

    expect(response.status).toBe(400);
  });

  it("returns 404 when user not found during update", async () => {
    mockFindByIdAndUpdateChain.select.mockResolvedValueOnce(null);

    const req = createRequest("PATCH", undefined, { name: "Ghost" });
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("updates mode and enforces side effects", async () => {
    const updatedUser = {
      ...fakeUser,
      mode: "lockin",
      status: "dnd",
    };
    mockFindByIdAndUpdateChain.select.mockResolvedValueOnce(updatedUser);

    const req = createRequest("PATCH", undefined, { mode: "lockin" });
    const response = await PATCH(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify that findByIdAndUpdate was called with $set containing mode side effects
    const updateArg = mockFindByIdAndUpdate.mock.calls[0][1] as Record<string, Record<string, unknown>>;
    expect(updateArg.$set?.mode).toBe("lockin");
    expect(updateArg.$set?.status).toBe("dnd");
    expect(updateArg.$set?.["preferences.notifications"]).toBe(false);
  });
});

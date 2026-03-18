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

const mockWorkspaceChain = {
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};

const mockWorkspaceCreate = vi.fn();

vi.mock("@/lib/infra/db/models/workspace", () => ({
  default: {
    find: vi.fn(() => mockWorkspaceChain),
    create: vi.fn((...args: unknown[]) => mockWorkspaceCreate(...args)),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

// ── Import route handlers after all mocks ─────────────────────────

const { GET, POST } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(method: string, url = "http://localhost:3000/api/workspaces", body?: object) {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const defaultContext = { params: Promise.resolve({}) };

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns 200 with user's workspaces", async () => {
    const fakeWorkspaces = [
      { _id: "ws1", name: "Workspace 1", ownerId: TEST_USER_ID },
    ];
    mockWorkspaceChain.lean.mockResolvedValue(fakeWorkspaces);

    const res = await GET(createRequest("GET"), defaultContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.workspaces).toEqual(fakeWorkspaces);
    expect(body.data.pagination).toBeDefined();
  });
});

describe("POST /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockWorkspaceCreate.mockResolvedValue({
      _id: "new-ws",
      name: "My Workspace",
      ownerId: TEST_USER_ID,
      members: [],
    });
  });

  it("creates a workspace and returns 201", async () => {
    const res = await POST(
      createRequest("POST", undefined, { name: "My Workspace" }),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockWorkspaceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Workspace" }),
    );
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(
      createRequest("POST", undefined, {}),
      defaultContext,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

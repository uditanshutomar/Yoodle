import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_WORKSPACE_ID = "507f1f77bcf86cd799439022";

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

const mockFindById = vi.fn();
const mockFindByIdAndDelete = vi.fn();

vi.mock("@/lib/infra/db/models/workspace", () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdAndDelete: (...args: unknown[]) => mockFindByIdAndDelete(...args),
  },
}));

// ── Import route handlers after all mocks ─────────────────────────

const { GET, PATCH, DELETE } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(method: string, body?: object) {
  const url = `http://localhost:3000/api/workspaces/${TEST_WORKSPACE_ID}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

const makeContext = (workspaceId = TEST_WORKSPACE_ID) => ({
  params: Promise.resolve({ workspaceId }),
});

function makeWorkspace(overrides = {}) {
  return {
    _id: TEST_WORKSPACE_ID,
    name: "Test Workspace",
    description: "A test workspace",
    ownerId: { toString: () => TEST_USER_ID },
    members: [
      { userId: { toString: () => TEST_USER_ID }, role: "owner", joinedAt: new Date() },
    ],
    settings: { autoShutdown: true, shutdownAfterMinutes: 60 },
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/workspaces/[workspaceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns workspace details", async () => {
    const ws = makeWorkspace();
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(ws) });

    const res = await GET(createRequest("GET"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Test Workspace");
  });

  it("returns 404 for non-existent workspace", async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await GET(createRequest("GET"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/workspaces/[workspaceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("updates workspace name", async () => {
    const ws = makeWorkspace();
    mockFindById.mockResolvedValue(ws);

    const res = await PATCH(
      createRequest("PATCH", { name: "Updated Name" }),
      makeContext(),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(ws.save).toHaveBeenCalled();
    expect(ws.name).toBe("Updated Name");
  });

  it("returns 404 for non-existent workspace", async () => {
    mockFindById.mockResolvedValue(null);

    const res = await PATCH(
      createRequest("PATCH", { name: "Updated" }),
      makeContext(),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("DELETE /api/workspaces/[workspaceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("deletes workspace when called by owner", async () => {
    const ws = makeWorkspace();
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(ws),
      }),
    });
    mockFindByIdAndDelete.mockResolvedValue(ws);

    const res = await DELETE(createRequest("DELETE"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it("returns 403 for non-owner delete", async () => {
    const ws = makeWorkspace({ ownerId: { toString: () => "other-user-id" } });
    mockFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(ws),
      }),
    });

    const res = await DELETE(createRequest("DELETE"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

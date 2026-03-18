import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_WORKSPACE_ID = "507f1f77bcf86cd799439022";
const TEST_MEMBER_ID = "507f1f77bcf86cd799439033";

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

const mockWorkspaceFindById = vi.fn();
const mockWorkspaceFindOneAndUpdate = vi.fn();

vi.mock("@/lib/infra/db/models/workspace", () => ({
  default: {
    findById: (...args: unknown[]) => mockWorkspaceFindById(...args),
    findOneAndUpdate: (...args: unknown[]) => mockWorkspaceFindOneAndUpdate(...args),
  },
}));

const mockUserFindOne = vi.fn();
const mockUserFindById = vi.fn();

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

vi.mock("@/lib/infra/db/models/audit-log", () => ({
  default: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

// ── Import route handlers after all mocks ─────────────────────────

const { GET, POST, DELETE } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(method: string, url?: string, body?: object) {
  const base = url || `http://localhost:3000/api/workspaces/${TEST_WORKSPACE_ID}/members`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(base, init);
}

const makeContext = () => ({
  params: Promise.resolve({ workspaceId: TEST_WORKSPACE_ID }),
});

function makeWorkspaceMembers() {
  return {
    _id: TEST_WORKSPACE_ID,
    ownerId: { toString: () => TEST_USER_ID },
    members: [
      {
        userId: { toString: () => TEST_USER_ID, _id: { toString: () => TEST_USER_ID } },
        role: "owner",
        joinedAt: new Date(),
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/workspaces/[workspaceId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns workspace members", async () => {
    const ws = makeWorkspaceMembers();
    mockWorkspaceFindById.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(ws),
      }),
    });

    const res = await GET(createRequest("GET"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("returns 404 for non-existent workspace", async () => {
    mockWorkspaceFindById.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await GET(createRequest("GET"), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe("POST /api/workspaces/[workspaceId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("adds a member by email", async () => {
    mockWorkspaceFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeWorkspaceMembers()),
      }),
    });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: { toString: () => TEST_MEMBER_ID } }),
      }),
    });
    mockWorkspaceFindOneAndUpdate.mockResolvedValue({ _id: TEST_WORKSPACE_ID });
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ name: "Actor", displayName: "Actor" }),
      }),
    });

    const res = await POST(
      createRequest("POST", undefined, { email: "new@example.com", role: "member" }),
      makeContext(),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.added).toBe(true);
  });
});

describe("DELETE /api/workspaces/[workspaceId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("removes a member", async () => {
    mockWorkspaceFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeWorkspaceMembers()),
      }),
    });
    mockWorkspaceFindOneAndUpdate.mockResolvedValue({ _id: TEST_WORKSPACE_ID });
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ name: "Actor", displayName: "Actor" }),
      }),
    });

    const url = `http://localhost:3000/api/workspaces/${TEST_WORKSPACE_ID}/members?memberId=${TEST_MEMBER_ID}`;
    const res = await DELETE(createRequest("DELETE", url), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.removed).toBe(true);
  });
});

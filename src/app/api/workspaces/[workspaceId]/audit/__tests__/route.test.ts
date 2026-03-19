import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_WORKSPACE_ID = "507f1f77bcf86cd799439033";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockFindWorkspaceOrThrow = vi.fn();
const mockVerifyWorkspaceAdminAccess = vi.fn();
vi.mock("@/lib/workspace/helpers", () => ({
  findWorkspaceOrThrow: (...args: unknown[]) => mockFindWorkspaceOrThrow(...args),
  verifyWorkspaceAdminAccess: (...args: unknown[]) => mockVerifyWorkspaceAdminAccess(...args),
}));

const mockAuditFind = vi.fn();
const mockAuditCountDocuments = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/infra/db/models/audit-log", () => ({
  default: {
    find: (...args: unknown[]) => mockAuditFind(...args),
    countDocuments: (...args: unknown[]) => mockAuditCountDocuments(...args),
  },
}));

// ── Import route after all mocks ─────────────────────────────────

const { GET } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────

function createRequest(url?: string) {
  const finalUrl = url || `http://localhost:3000/api/workspaces/${TEST_WORKSPACE_ID}/audit`;
  return new NextRequest(finalUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function createContext(workspaceId = TEST_WORKSPACE_ID) {
  return { params: Promise.resolve({ workspaceId }) };
}

const fakeWorkspace = {
  _id: TEST_WORKSPACE_ID,
  ownerId: { toString: () => TEST_USER_ID },
  members: [{ userId: { toString: () => TEST_USER_ID }, role: "admin" }],
};

function setupAuditLogs(logs: object[], total: number) {
  mockAuditFind.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(logs),
        }),
      }),
    }),
  });
  mockAuditCountDocuments.mockResolvedValue(total);
}

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /api/workspaces/[workspaceId]/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockFindWorkspaceOrThrow.mockResolvedValue(fakeWorkspace);
    mockVerifyWorkspaceAdminAccess.mockReturnValue(undefined);
    setupAuditLogs([], 0);
  });

  it("returns 200 with audit logs and pagination", async () => {
    const logs = [
      { _id: "log1", action: "user.invite", createdAt: "2025-01-01" },
      { _id: "log2", action: "settings.update", createdAt: "2025-01-02" },
    ];
    setupAuditLogs(logs, 2);

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.logs).toHaveLength(2);
    expect(body.data.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 2,
      totalPages: 1,
    });
  });

  it("returns empty logs when no audit events exist", async () => {
    setupAuditLogs([], 0);

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.logs).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
    expect(body.data.pagination.totalPages).toBe(0);
  });

  it("respects page and limit query params", async () => {
    setupAuditLogs([{ _id: "log3" }], 120);

    const url = `http://localhost:3000/api/workspaces/${TEST_WORKSPACE_ID}/audit?page=3&limit=25`;
    const res = await GET(createRequest(url), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pagination.page).toBe(3);
    expect(body.data.pagination.limit).toBe(25);
    expect(body.data.pagination.totalPages).toBe(5);
  });

  it("caps limit at 100", async () => {
    setupAuditLogs([], 0);

    const url = `http://localhost:3000/api/workspaces/${TEST_WORKSPACE_ID}/audit?limit=500`;
    const res = await GET(createRequest(url), createContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pagination.limit).toBe(100);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 403 when user is not a workspace admin", async () => {
    const { ForbiddenError } = await import("@/lib/infra/api/errors");
    mockVerifyWorkspaceAdminAccess.mockImplementation(() => {
      throw new ForbiddenError("Only owners and admins can view audit logs.");
    });

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("returns 404 when workspace is not found", async () => {
    const { NotFoundError } = await import("@/lib/infra/api/errors");
    mockFindWorkspaceOrThrow.mockRejectedValue(new NotFoundError("Workspace not found."));

    const res = await GET(createRequest(), createContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid workspace ID", async () => {
    const { BadRequestError } = await import("@/lib/infra/api/errors");
    mockFindWorkspaceOrThrow.mockRejectedValue(new BadRequestError("Invalid workspace ID"));

    const res = await GET(createRequest(), createContext("not-valid-id"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

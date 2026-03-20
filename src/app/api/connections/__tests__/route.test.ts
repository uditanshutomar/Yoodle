import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

// ─── User mock ──────────────────────────────────────────────────────

const mockUserFindOne = vi.fn();
const mockUserFindById = vi.fn();
const mockUserFind = vi.fn();

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findOne: vi.fn().mockImplementation((...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockUserFindOne(...args)),
      }),
    })),
    findById: vi.fn().mockImplementation((...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockUserFindById(...args)),
      }),
    })),
    find: vi.fn().mockImplementation((...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockUserFind(...args)),
      }),
    })),
  },
}));

// ─── Connection mock ────────────────────────────────────────────────

const mockConnectionFindOne = vi.fn();
const mockConnectionCreate = vi.fn();
const mockConnectionFind = vi.fn();

vi.mock("@/lib/infra/db/models/connection", () => ({
  default: {
    findOne: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockConnectionFindOne(...args)),
    })),
    create: (...args: unknown[]) => mockConnectionCreate(...args),
    find: vi.fn().mockImplementation((...args: unknown[]) => ({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockImplementation(() => mockConnectionFind(...args)),
        }),
      }),
    })),
  },
}));

// ─── Notification mock ──────────────────────────────────────────────

const mockNotificationCreate = vi.fn();

vi.mock("@/lib/infra/db/models/notification", () => ({
  default: {
    create: (...args: unknown[]) => mockNotificationCreate(...args),
  },
}));

import { POST, GET } from "../route";
import { NextRequest } from "next/server";

const SELF_ID = "607f1f77bcf86cd799439011";
const OTHER_ID = "607f1f77bcf86cd799439022";

function makePostReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

function makeGetReq(status?: string) {
  const url = status
    ? `http://localhost/api/connections?status=${status}`
    : "http://localhost/api/connections";
  return new NextRequest(url, {
    method: "GET",
    headers: { Origin: "http://localhost:3000" },
  });
}

describe("POST /api/connections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates connection request for valid email -> 201", async () => {
    mockUserFindOne.mockResolvedValue({ _id: OTHER_ID });
    mockConnectionFindOne.mockResolvedValue(null);
    mockConnectionCreate.mockResolvedValue({
      _id: "607f1f77bcf86cd799439033",
      status: "pending",
    });
    mockUserFindById.mockResolvedValue({ _id: SELF_ID, name: "Test User" });
    mockNotificationCreate.mockResolvedValue({});

    const res = await POST(makePostReq({ email: "other@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("607f1f77bcf86cd799439033");
    expect(body.data.recipientId).toBe(OTHER_ID);
    expect(body.data.status).toBe("pending");
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makePostReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for self-request", async () => {
    mockUserFindOne.mockResolvedValue({ _id: SELF_ID });

    const res = await POST(makePostReq({ email: "self@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 404 when email not found", async () => {
    mockUserFindOne.mockResolvedValue(null);

    const res = await POST(makePostReq({ email: "nobody@example.com" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when connection already exists", async () => {
    mockUserFindOne.mockResolvedValue({ _id: OTHER_ID });
    mockConnectionFindOne.mockResolvedValue({
      _id: "607f1f77bcf86cd799439044",
      status: "pending",
    });

    const res = await POST(makePostReq({ email: "other@example.com" }));
    expect(res.status).toBe(409);
  });

  it("returns 403 when connection is blocked", async () => {
    mockUserFindOne.mockResolvedValue({ _id: OTHER_ID });
    mockConnectionFindOne.mockResolvedValue({
      _id: "607f1f77bcf86cd799439044",
      status: "blocked",
    });

    const res = await POST(makePostReq({ email: "other@example.com" }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/connections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns accepted connections by default", async () => {
    const now = new Date();
    mockConnectionFind.mockResolvedValue([
      {
        _id: "607f1f77bcf86cd799439033",
        requesterId: { toString: () => SELF_ID },
        recipientId: { toString: () => OTHER_ID },
        status: "accepted",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockUserFind.mockResolvedValue([
      {
        _id: { toString: () => OTHER_ID },
        name: "Other User",
        displayName: "Other",
        avatarUrl: null,
        status: "online",
        mode: "social",
      },
    ]);

    const res = await GET(makeGetReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].userId).toBe(OTHER_ID);
    expect(body.data[0].direction).toBe("sent");
    expect(body.data[0].connectionStatus).toBe("accepted");
  });

  it("returns pending connections when requested", async () => {
    mockConnectionFind.mockResolvedValue([]);
    mockUserFind.mockResolvedValue([]);

    const res = await GET(makeGetReq("pending"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });
});

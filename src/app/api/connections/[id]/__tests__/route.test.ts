import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Constants ──────────────────────────────────────────────────────

const USER_ID = "607f1f77bcf86cd799439011";
const OTHER_USER_ID = "607f1f77bcf86cd799439022";
const CONN_ID = "607f1f77bcf86cd799439033";

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

const mockFindOneAndUpdate = vi.fn();
const mockFindById = vi.fn();
const mockFindOneAndDelete = vi.fn();

vi.mock("@/lib/infra/db/models/connection", () => ({
  default: {
    findOneAndUpdate: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindOneAndUpdate(...args)),
    })),
    findById: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindById(...args)),
    })),
    findOneAndDelete: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindOneAndDelete(...args)),
    })),
  },
  CONNECTION_STATUSES: ["pending", "accepted", "blocked"],
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeReq(body: unknown, method = "PATCH"): NextRequest {
  return new NextRequest("http://localhost:3000/api/connections/" + CONN_ID, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(): NextRequest {
  return new NextRequest("http://localhost:3000/api/connections/" + CONN_ID, {
    method: "DELETE",
    headers: {
      Origin: "http://localhost:3000",
    },
  });
}

// ─── Import handlers after mocks ────────────────────────────────────

import { PATCH, DELETE } from "../route";

// ─── Tests ──────────────────────────────────────────────────────────

describe("PATCH /api/connections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a pending request → 200, status accepted", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      _id: CONN_ID,
      requesterId: OTHER_USER_ID,
      recipientId: USER_ID,
      status: "accepted",
    });

    const params = Promise.resolve({ id: CONN_ID });
    const res = await PATCH(makeReq({ action: "accept" }), { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(CONN_ID);
    expect(json.data.status).toBe("accepted");
  });

  it("blocks a pending request → 200, status blocked", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      _id: CONN_ID,
      requesterId: OTHER_USER_ID,
      recipientId: USER_ID,
      status: "blocked",
    });

    const params = Promise.resolve({ id: CONN_ID });
    const res = await PATCH(makeReq({ action: "block" }), { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("blocked");
  });

  it("returns 404 when not found or not authorized", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);

    const params = Promise.resolve({ id: CONN_ID });
    const res = await PATCH(makeReq({ action: "accept" }), { params });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("returns 400 for invalid action", async () => {
    const params = Promise.resolve({ id: CONN_ID });
    const res = await PATCH(makeReq({ action: "invalid" }), { params });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("returns 400 for invalid connection ID", async () => {
    const params = Promise.resolve({ id: "not-valid" });
    const res = await PATCH(makeReq({ action: "accept" }), { params });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});

describe("DELETE /api/connections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes an accepted connection → 200, removed: true", async () => {
    mockFindById.mockResolvedValue({
      _id: CONN_ID,
      requesterId: { toString: () => USER_ID },
      recipientId: { toString: () => OTHER_USER_ID },
      status: "accepted",
    });
    mockFindOneAndDelete.mockResolvedValue({});

    const params = Promise.resolve({ id: CONN_ID });
    const res = await DELETE(makeDeleteReq(), { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.removed).toBe(true);
  });

  it("allows sender to cancel a pending request", async () => {
    mockFindById.mockResolvedValue({
      _id: CONN_ID,
      requesterId: { toString: () => USER_ID },
      recipientId: { toString: () => OTHER_USER_ID },
      status: "pending",
    });
    mockFindOneAndDelete.mockResolvedValue({});

    const params = Promise.resolve({ id: CONN_ID });
    const res = await DELETE(makeDeleteReq(), { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.removed).toBe(true);
  });

  it("returns 404 when not found", async () => {
    mockFindById.mockResolvedValue(null);

    const params = Promise.resolve({ id: CONN_ID });
    const res = await DELETE(makeDeleteReq(), { params });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("returns 404 when user is not a party to the connection", async () => {
    mockFindById.mockResolvedValue({
      _id: CONN_ID,
      requesterId: { toString: () => "607f1f77bcf86cd799439044" },
      recipientId: { toString: () => "607f1f77bcf86cd799439055" },
      status: "accepted",
    });

    const params = Promise.resolve({ id: CONN_ID });
    const res = await DELETE(makeDeleteReq(), { params });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("returns 403 when recipient tries to cancel a pending request", async () => {
    mockFindById.mockResolvedValue({
      _id: CONN_ID,
      requesterId: { toString: () => OTHER_USER_ID },
      recipientId: { toString: () => USER_ID },
      status: "pending",
    });

    const params = Promise.resolve({ id: CONN_ID });
    const res = await DELETE(makeDeleteReq(), { params });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error.message).toContain("Only the sender can cancel");
  });

  it("returns 400 for invalid connection ID", async () => {
    const params = Promise.resolve({ id: "bad-id" });
    const res = await DELETE(makeDeleteReq(), { params });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});

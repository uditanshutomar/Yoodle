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

// Mock MeetingTemplate model
const mockFindChain = {
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};

const mockFindOneChain = {
  lean: vi.fn().mockResolvedValue(null),
};

const mockCreate = vi.fn();
const mockFind = vi.fn(() => mockFindChain);
const mockFindOne = vi.fn(() => mockFindOneChain);

vi.mock("@/lib/infra/db/models/meeting-template", () => ({
  default: {
    find: (...args: unknown[]) => mockFind(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET, POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

function createRequest(
  method: string,
  url = "http://localhost:3000/api/meetings/templates",
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

describe("GET /api/meetings/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns user's templates", async () => {
    const fakeTemplates = [
      { _id: "t1", name: "Standup", defaultDuration: 15 },
      { _id: "t2", name: "Retro", defaultDuration: 60 },
    ];
    mockFindChain.lean.mockResolvedValueOnce(fakeTemplates);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(fakeTemplates);
  });

  it("returns empty array when user has no templates", async () => {
    mockFindChain.lean.mockResolvedValueOnce([]);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ── POST tests ─────────────────────────────────────────────────────

describe("POST /api/meetings/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockFindOneChain.lean.mockResolvedValue(null); // no duplicate
  });

  it("creates a template and returns 201", async () => {
    const newTemplate = {
      _id: "new-template-id",
      name: "Weekly Sync",
      defaultDuration: 30,
      userId: TEST_USER_ID,
    };
    mockCreate.mockResolvedValueOnce(newTemplate);

    const req = createRequest("POST", undefined, {
      name: "Weekly Sync",
      defaultDuration: 30,
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Weekly Sync");
  });

  it("returns 400 for missing name", async () => {
    const req = createRequest("POST", undefined, {
      defaultDuration: 30,
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for name exceeding max length", async () => {
    const req = createRequest("POST", undefined, {
      name: "A".repeat(201),
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(400);
  });

  it("returns 409 when duplicate template name exists", async () => {
    mockFindOneChain.lean.mockResolvedValueOnce({
      _id: "existing-id",
      name: "Standup",
    });

    const req = createRequest("POST", undefined, {
      name: "Standup",
    });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("DUPLICATE_TEMPLATE");
  });

  it("returns 400 for invalid defaultDuration (below minimum)", async () => {
    const req = createRequest("POST", undefined, {
      name: "Quick",
      defaultDuration: 2,
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(400);
  });
});

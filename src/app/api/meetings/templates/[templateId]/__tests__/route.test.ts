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
const mockFindOneAndUpdateChain = {
  lean: vi.fn().mockResolvedValue(null),
};
const mockFindOneAndUpdate = vi.fn(() => mockFindOneAndUpdateChain);
const mockDeleteOne = vi.fn().mockResolvedValue({ deletedCount: 0 });

vi.mock("@/lib/infra/db/models/meeting-template", () => ({
  default: {
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => mockDeleteOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { PUT, DELETE } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_TEMPLATE_ID = "507f1f77bcf86cd799439022";

function createRequest(method: string, body?: object) {
  return new NextRequest(
    `http://localhost:3000/api/meetings/templates/${TEST_TEMPLATE_ID}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

const defaultContext = {
  params: Promise.resolve({ templateId: TEST_TEMPLATE_ID }),
};

// ── PUT tests ─────────────────────────────────────────────────────

describe("PUT /api/meetings/templates/[templateId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("updates template", async () => {
    const updatedTemplate = {
      _id: TEST_TEMPLATE_ID,
      name: "Updated Template",
      description: "Updated description",
      userId: TEST_USER_ID,
    };
    mockFindOneAndUpdateChain.lean.mockResolvedValueOnce(updatedTemplate);

    const req = createRequest("PUT", { name: "Updated Template", description: "Updated description" });
    const response = await PUT(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Updated Template");
  });

  it("returns 404 for non-existent template", async () => {
    mockFindOneAndUpdateChain.lean.mockResolvedValueOnce(null);

    const req = createRequest("PUT", { name: "Nope" });
    const response = await PUT(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ── DELETE tests ──────────────────────────────────────────────────

describe("DELETE /api/meetings/templates/[templateId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("deletes template", async () => {
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const req = createRequest("DELETE");
    const response = await DELETE(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it("returns 404 for non-existent template", async () => {
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    const req = createRequest("DELETE");
    const response = await DELETE(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

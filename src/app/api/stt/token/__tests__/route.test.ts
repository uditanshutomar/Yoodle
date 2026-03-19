import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────

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

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// Mock global fetch for Deepgram API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { POST } = await import("../route");

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

function createRequest() {
  return new NextRequest("http://localhost:3000/api/stt/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
  });
}

function mockDeepgramProjectsResponse(projectId: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      projects: [{ project_id: projectId }],
    }),
  };
}

function mockDeepgramKeyResponse(key: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ key }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/stt/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    process.env.DEEPGRAM_API_KEY = "test-deepgram-key";
  });

  it("returns a temporary Deepgram key on success", async () => {
    mockFetch
      .mockResolvedValueOnce(mockDeepgramProjectsResponse("proj-123"))
      .mockResolvedValueOnce(mockDeepgramKeyResponse("temp-key-abc"));

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.key).toBe("temp-key-abc");
  });

  it("calls Deepgram projects API then keys API with correct params", async () => {
    mockFetch
      .mockResolvedValueOnce(mockDeepgramProjectsResponse("proj-456"))
      .mockResolvedValueOnce(mockDeepgramKeyResponse("temp-key-xyz"));

    await POST(createRequest(), { params: Promise.resolve({}) });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call: projects list
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.deepgram.com/v1/projects",
      expect.objectContaining({
        headers: { Authorization: "Token test-deepgram-key" },
      }),
    );

    // Second call: create key
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.deepgram.com/v1/projects/proj-456/keys",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Token test-deepgram-key",
        }),
      }),
    );
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 500 when DEEPGRAM_API_KEY is not set", async () => {
    delete process.env.DEEPGRAM_API_KEY;

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when projects API fails to return a project ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ projects: [] }),
    });

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when projects API returns non-OK status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when key creation API fails", async () => {
    mockFetch
      .mockResolvedValueOnce(mockDeepgramProjectsResponse("proj-123"))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      });

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when key creation succeeds but response has no key", async () => {
    mockFetch
      .mockResolvedValueOnce(mockDeepgramProjectsResponse("proj-123"))
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when fetch throws a network error for projects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when fetch throws a network error for key creation", async () => {
    mockFetch
      .mockResolvedValueOnce(mockDeepgramProjectsResponse("proj-123"))
      .mockRejectedValueOnce(new Error("Network failure"));

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

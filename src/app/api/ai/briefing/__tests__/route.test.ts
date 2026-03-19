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

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

const mockHasGoogleAccess = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/google/client", () => ({
  hasGoogleAccess: (...args: unknown[]) => mockHasGoogleAccess(...args),
}));

const mockBuildWorkspaceContext = vi.fn();

vi.mock("@/lib/google/workspace-context", () => ({
  buildWorkspaceContext: (...args: unknown[]) => mockBuildWorkspaceContext(...args),
}));

vi.mock("@/lib/ai/prompts", () => ({
  SYSTEM_PROMPTS: {
    BRIEFING: "You are a briefing assistant.",
  },
}));

// Mock Gemini AI
const mockGenerateContent = vi.fn().mockResolvedValue({
  text: "Here is your morning briefing: 3 unread emails, 1 meeting in 30 min.",
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { UnauthorizedError, RateLimitError } from "@/lib/infra/api/errors";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

function createSnapshot(overrides = {}) {
  return {
    unreadCount: 3,
    emailIds: ["e1", "e2", "e3"],
    nextMeetingId: "m1",
    nextMeetingTime: "2026-03-18T10:00:00Z",
    boardTaskCount: 5,
    boardOverdueCount: 1,
    boardTaskIds: ["t1", "t2"],
    unresolvedMeetingActions: 2,
    activeConversationThreads: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

function createPostRequest() {
  return new NextRequest("http://localhost:3000/api/ai/briefing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: JSON.stringify({}),
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── POST tests ────────────────────────────────────────────────────

describe("POST /api/ai/briefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    process.env.GEMINI_API_KEY = "test-key";

    const snapshot = createSnapshot();
    mockBuildWorkspaceContext.mockResolvedValue({
      contextString: "3 unread emails, meeting at 10am",
      snapshot,
    });
    mockHasGoogleAccess.mockResolvedValue(true);
    mockGenerateContent.mockResolvedValue({
      text: "Here is your briefing: 3 unread emails, 1 meeting.",
    });
  });

  // ── Success cases ──────────────────────────────────────────────

  it("returns briefing with metadata on valid request", async () => {
    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.briefing).toContain("briefing");
    expect(body.data.metadata).toBeDefined();
    expect(body.data.metadata.unreadCount).toBe(3);
    expect(body.data.metadata.nextMeetingTime).toBe("2026-03-18T10:00:00Z");
    expect(body.data.metadata.boardTaskCount).toBe(5);
    expect(body.data.metadata.boardOverdueCount).toBe(1);
    expect(body.data.metadata.unresolvedMeetingActions).toBe(2);
  });

  it("calls Gemini with workspace context and system prompt", async () => {
    const userId = "gemini-call-test-user";
    mockedGetUserId.mockResolvedValue(userId);

    const req = createPostRequest();
    await POST(req, defaultContext);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents[0].parts[0].text).toContain("3 unread emails");
    expect(callArg.config.systemInstruction.parts[0].text).toBe("You are a briefing assistant.");
  });

  // ── No Google access ───────────────────────────────────────────

  it("returns null briefing with reason when user has no Google access", async () => {
    mockHasGoogleAccess.mockResolvedValueOnce(false);

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.briefing).toBeNull();
    expect(body.data.reason).toBe("no_google_access");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  // ── No workspace data ──────────────────────────────────────────

  it("returns null briefing when workspace context is empty", async () => {
    mockBuildWorkspaceContext.mockResolvedValueOnce({
      contextString: "",
      snapshot: createSnapshot(),
    });

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.briefing).toBeNull();
    expect(body.data.reason).toBe("no_workspace_data");
  });

  // ── Cache / snapshot diff behavior ─────────────────────────────

  it("returns briefing on first call (no cached snapshot)", async () => {
    const userId = "first-call-test-user";
    mockedGetUserId.mockResolvedValue(userId);

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.briefing).toBeTruthy();
  });

  it("returns no_changes when snapshot has not changed on second call", async () => {
    const snapshot = createSnapshot({ unreadCount: 5 });
    mockBuildWorkspaceContext.mockResolvedValue({
      contextString: "5 unread emails",
      snapshot,
    });

    // Use a unique user ID to avoid interference from other tests
    const cacheTestUserId = "cache-test-user-no-change";
    mockedGetUserId.mockResolvedValue(cacheTestUserId);

    // First call — should generate briefing
    const req1 = createPostRequest();
    const response1 = await POST(req1, defaultContext);
    const body1 = await response1.json();
    expect(body1.data.briefing).toBeTruthy();

    // Second call with same snapshot — should return no_changes
    const req2 = createPostRequest();
    const response2 = await POST(req2, defaultContext);
    const body2 = await response2.json();

    expect(body2.data.briefing).toBeNull();
    expect(body2.data.reason).toBe("no_changes");
  });

  it("returns new briefing when snapshot changes between calls", async () => {
    const cacheTestUserId = "cache-test-user-changed";
    mockedGetUserId.mockResolvedValue(cacheTestUserId);

    const snapshot1 = createSnapshot({ unreadCount: 3 });
    mockBuildWorkspaceContext.mockResolvedValueOnce({
      contextString: "3 unread emails",
      snapshot: snapshot1,
    });

    // First call
    const req1 = createPostRequest();
    await POST(req1, defaultContext);

    // Second call with different snapshot
    const snapshot2 = createSnapshot({ unreadCount: 7 });
    mockBuildWorkspaceContext.mockResolvedValueOnce({
      contextString: "7 unread emails",
      snapshot: snapshot2,
    });

    const req2 = createPostRequest();
    const response2 = await POST(req2, defaultContext);
    const body2 = await response2.json();

    expect(body2.data.briefing).toBeTruthy();
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  // ── Gemini returns NO_UPDATE ───────────────────────────────────

  it("returns no_changes when Gemini responds with NO_UPDATE", async () => {
    const cacheTestUserId = "cache-test-user-no-update";
    mockedGetUserId.mockResolvedValue(cacheTestUserId);

    mockGenerateContent.mockResolvedValueOnce({
      text: "NO_UPDATE",
    });

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.briefing).toBeNull();
    expect(body.data.reason).toBe("no_changes");
  });

  // ── Auth / rate-limit errors ───────────────────────────────────

  it("returns 401 when no auth token is provided", async () => {
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockedCheckRateLimit.mockRejectedValueOnce(new RateLimitError(30));

    const req = createPostRequest();
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  // ── Error handling ─────────────────────────────────────────────

  it("returns 500 when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    // Use unique user to bypass cache
    const userId = "no-api-key-user";
    mockedGetUserId.mockResolvedValue(userId);

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CONFIGURATION_ERROR");
  });

  it("returns 500 when Gemini generateContent throws", async () => {
    // Use unique user to bypass cache
    const userId = "gemini-error-user";
    mockedGetUserId.mockResolvedValue(userId);

    mockGenerateContent.mockRejectedValueOnce(new Error("Gemini quota exceeded"));

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("returns 500 when buildWorkspaceContext throws", async () => {
    mockBuildWorkspaceContext.mockRejectedValueOnce(new Error("Google API error"));

    const req = createPostRequest();
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

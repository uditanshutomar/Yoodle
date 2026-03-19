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

// Mock AIMemory model with chainable query
const mockMemoryFind = vi.fn(() => ({
  sort: vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    }),
  }),
}));

vi.mock("@/lib/infra/db/models/ai-memory", () => ({
  default: {
    find: (...args: unknown[]) => mockMemoryFind(...args),
  },
}));

// Mock workspace context
const mockBuildWorkspaceContext = vi.fn().mockResolvedValue({
  contextString: "Some workspace context",
  snapshot: {
    unreadCount: 0,
    emailIds: [],
    nextMeetingId: null,
    nextMeetingTime: null,
    boardTaskCount: null,
    boardOverdueCount: null,
    boardTaskIds: null,
    unresolvedMeetingActions: null,
    activeConversationThreads: null,
    timestamp: Date.now(),
  },
});

vi.mock("@/lib/google/workspace-context", () => ({
  buildWorkspaceContext: (...args: unknown[]) => mockBuildWorkspaceContext(...args),
}));

const mockHasGoogleAccess = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/google/client", () => ({
  hasGoogleAccess: (...args: unknown[]) => mockHasGoogleAccess(...args),
}));

// Mock streaming chat
const mockStreamChatWithAssistant = vi.fn();

vi.mock("@/lib/ai/gemini", () => ({
  streamChatWithAssistant: (...args: unknown[]) => mockStreamChatWithAssistant(...args),
}));

// Mock createStreamingResponse to return a simple Response
const mockCreateStreamingResponse = vi.fn().mockReturnValue(
  new Response("streaming", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  })
);

vi.mock("@/lib/ai/streaming", () => ({
  createStreamingResponse: (...args: unknown[]) => mockCreateStreamingResponse(...args),
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { UnauthorizedError } from "@/lib/infra/api/errors";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";

function createPostRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

const defaultContext = { params: Promise.resolve({}) };

// ── POST tests ────────────────────────────────────────────────────

describe("POST /api/ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);

    // Default: return an async generator that yields one text chunk
    async function* fakeGenerator() {
      yield "Hello!";
    }
    mockStreamChatWithAssistant.mockReturnValue(fakeGenerator());

    mockCreateStreamingResponse.mockReturnValue(
      new Response("streaming", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
  });

  // ── Success cases ──────────────────────────────────────────────

  it("returns streaming response for valid message (frontend format)", async () => {
    const req = createPostRequest({ message: "Hello" });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(mockStreamChatWithAssistant).toHaveBeenCalledTimes(1);
    expect(mockCreateStreamingResponse).toHaveBeenCalledTimes(1);
  });

  it("passes normalized messages to streamChatWithAssistant (frontend format)", async () => {
    const req = createPostRequest({
      message: "What's next?",
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ],
    });
    await POST(req, defaultContext);

    const [messages] = mockStreamChatWithAssistant.mock.calls[0];
    expect(messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "model", content: "Hello!" },
      { role: "user", content: "What's next?" },
    ]);
  });

  it("accepts direct messages format", async () => {
    const req = createPostRequest({
      messages: [
        { role: "user", content: "Summarize my day" },
      ],
    });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(200);
    const [messages] = mockStreamChatWithAssistant.mock.calls[0];
    expect(messages).toEqual([{ role: "user", content: "Summarize my day" }]);
  });

  it("passes user context including name and workspace context", async () => {
    mockBuildWorkspaceContext.mockResolvedValueOnce({
      contextString: "3 unread emails",
      snapshot: { unreadCount: 3, emailIds: [], nextMeetingId: null, nextMeetingTime: null, boardTaskCount: null, boardOverdueCount: null, boardTaskIds: null, unresolvedMeetingActions: null, activeConversationThreads: null, timestamp: Date.now() },
    });

    const req = createPostRequest({
      message: "Hello",
      context: { name: "Alice" },
    });
    await POST(req, defaultContext);

    const [, userContext] = mockStreamChatWithAssistant.mock.calls[0];
    expect(userContext.name).toBe("Alice");
    expect(userContext.workspaceContext).toBe("3 unread emails");
  });

  it("includes AI memories in user context when available", async () => {
    mockMemoryFind.mockReturnValueOnce({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { category: "preference", content: "Prefers concise answers" },
            { category: "fact", content: "Works on Project X" },
          ]),
        }),
      }),
    });

    const req = createPostRequest({ message: "Hello" });
    await POST(req, defaultContext);

    const [, userContext] = mockStreamChatWithAssistant.mock.calls[0];
    expect(userContext.memories).toEqual([
      "[preference] Prefers concise answers",
      "[fact] Works on Project X",
    ]);
  });

  it("enables tools when user has Google access", async () => {
    mockHasGoogleAccess.mockResolvedValueOnce(true);

    const req = createPostRequest({ message: "Hello" });
    await POST(req, defaultContext);

    const [, , options] = mockStreamChatWithAssistant.mock.calls[0];
    expect(options.enableTools).toBe(true);
    expect(options.userId).toBe(TEST_USER_ID);
  });

  it("disables tools when user has no Google access", async () => {
    mockHasGoogleAccess.mockResolvedValueOnce(false);

    const req = createPostRequest({ message: "Hello" });
    await POST(req, defaultContext);

    const [, , options] = mockStreamChatWithAssistant.mock.calls[0];
    expect(options.enableTools).toBe(false);
  });

  // ── Auth / rate-limit errors ───────────────────────────────────

  it("returns 401 when no auth token is provided", async () => {
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const req = createPostRequest({ message: "Hello" });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const { RateLimitError } = await import("@/lib/infra/api/errors");
    mockedCheckRateLimit.mockRejectedValueOnce(new RateLimitError(60));

    const req = createPostRequest({ message: "Hello" });
    const response = await POST(req, defaultContext);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  // ── Validation errors ──────────────────────────────────────────

  it("returns 400 when message is missing", async () => {
    const req = createPostRequest({});
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when message is empty string", async () => {
    const req = createPostRequest({ message: "" });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when messages array is empty", async () => {
    const req = createPostRequest({ messages: [] });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when message exceeds max length", async () => {
    const req = createPostRequest({ message: "x".repeat(8001) });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ── Error handling ─────────────────────────────────────────────

  it("returns 500 when workspace context build fails and streaming still works", async () => {
    // Workspace context failure is caught internally, route should still succeed
    mockBuildWorkspaceContext.mockRejectedValueOnce(new Error("Google API down"));

    const req = createPostRequest({ message: "Hello" });
    const response = await POST(req, defaultContext);

    // Route catches workspace context errors and falls back to empty context
    expect(response.status).toBe(200);
  });

  it("returns 500 when streamChatWithAssistant throws", async () => {
    mockStreamChatWithAssistant.mockImplementationOnce(() => {
      throw new Error("Gemini unavailable");
    });

    const req = createPostRequest({ message: "Hello" });
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("gracefully handles hasGoogleAccess failure (defaults to false)", async () => {
    mockHasGoogleAccess.mockRejectedValueOnce(new Error("Redis down"));

    const req = createPostRequest({ message: "Hello" });
    const response = await POST(req, defaultContext);

    // hasGoogleAccess failure is caught internally, defaults to false
    expect(response.status).toBe(200);
    const [, , options] = mockStreamChatWithAssistant.mock.calls[0];
    expect(options.enableTools).toBe(false);
  });
});

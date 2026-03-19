import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
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

vi.mock("@/lib/ai/prompts", () => ({
  SYSTEM_PROMPTS: { REVISE_ACTION: "You are a helpful assistant." },
}));

const mockGenerateContent = vi.fn();
vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContent: (...args: unknown[]) => mockGenerateContent(...args),
        };
      }
    },
  };
});

function createRequest(body: Record<string, unknown>): NextRequest {
  const url = "http://localhost:3000/api/ai/action/revise";
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

// Set GEMINI_API_KEY before importing the route
vi.stubEnv("GEMINI_API_KEY", "test-api-key");

const { POST } = await import("../route");

describe("POST /api/ai/action/revise", () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = {
    actionType: "create_task",
    args: { title: "Fix bug", assignee: "alice" },
    summary: "Create a task to fix the bug",
    userFeedback: "Change the assignee to bob instead",
  };

  it("returns revised action on valid request", async () => {
    const revisedJson = JSON.stringify({
      actionType: "create_task",
      args: { title: "Fix bug", assignee: "bob" },
      summary: "Create a task to fix the bug, assigned to bob",
    });
    mockGenerateContent.mockResolvedValue({
      response: { text: () => revisedJson },
    });

    const res = await POST(createRequest(validBody), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.actionType).toBe("create_task");
    expect(body.data.args.assignee).toBe("bob");
    expect(body.data.summary).toContain("bob");
  });

  it("extracts JSON from markdown-wrapped response", async () => {
    const wrappedResponse = '```json\n{"actionType":"create_task","args":{"title":"Fix bug","assignee":"bob"},"summary":"revised"}\n```';
    mockGenerateContent.mockResolvedValue({
      response: { text: () => wrappedResponse },
    });

    const res = await POST(createRequest(validBody), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.actionType).toBe("create_task");
  });

  it("returns 400 when actionType is missing", async () => {
    const res = await POST(
      createRequest({ ...validBody, actionType: "" }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when userFeedback is missing", async () => {
    const res = await POST(
      createRequest({ ...validBody, userFeedback: "" }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when summary is missing", async () => {
    const res = await POST(
      createRequest({ ...validBody, summary: "" }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when args is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { args: _args, ...noArgs } = validBody;
    const res = await POST(createRequest(noArgs), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(createRequest(validBody), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 500 when GEMINI_API_KEY is not set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const res = await POST(createRequest(validBody), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);

    // Restore
    vi.stubEnv("GEMINI_API_KEY", "test-api-key");
  });

  it("returns 500 when AI returns unparseable response", async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "This is not JSON at all" },
    });

    const res = await POST(createRequest(validBody), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("falls back to original fields when AI omits them", async () => {
    const partialJson = JSON.stringify({
      actionType: "",
      args: null,
      summary: "",
    });
    mockGenerateContent.mockResolvedValue({
      response: { text: () => partialJson },
    });

    const res = await POST(createRequest(validBody), {
      params: Promise.resolve({}),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.actionType).toBe(validBody.actionType);
    expect(body.data.summary).toBe(validBody.summary);
    expect(body.data.args).toEqual(validBody.args);
  });
});

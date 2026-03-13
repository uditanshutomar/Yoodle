import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock User model — findOne returns a chainable query
const mockUserSelect = vi.fn();
const mockUserFindOne = vi.fn(() => ({ select: mockUserSelect }));
vi.mock("@/lib/db/models/user", () => ({
  default: {
    findOne: mockUserFindOne,
  },
}));

vi.mock("@/lib/auth/magic-link", () => ({
  generateMagicLink: vi.fn().mockResolvedValue("http://localhost:3000/api/auth/verify?token=abc&email=test%40example.com"),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// Mock Resend so it never actually sends emails
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "mock-email-id" }),
    },
  })),
}));

// Import mocked modules
import { checkRateLimit } from "@/lib/api/rate-limit";
import { generateMagicLink } from "@/lib/auth/magic-link";

const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedGenerateMagicLink = vi.mocked(generateMagicLink);

// Import route handler after mocks
const { POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

// withHandler returns a NextRouteHandler expecting (req, context) — provide a dummy context
const dummyCtx = { params: Promise.resolve({}) };

function createRequest(body?: object, headers?: Record<string, string>) {
  const url = "http://localhost:3000/api/auth/login";
  const init = {
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockResolvedValue(undefined);
    // Default: user exists
    mockUserSelect.mockResolvedValue({
      _id: "user-123",
      name: "Test User",
      displayName: "Tester",
    });
    mockedGenerateMagicLink.mockResolvedValue(
      "http://localhost:3000/api/auth/verify?token=abc&email=test%40example.com",
    );
    // Set RESEND_API_KEY to something that starts with "your-" so emails go to dev console
    process.env.RESEND_API_KEY = "your-test-key";
  });

  it("returns success with valid email (user exists)", async () => {
    const req = createRequest({ email: "test@example.com" });
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // The login route uses the legacy successResponse({ message }) form,
    // which places `message` at the top level (not nested under `data`)
    expect(body.message).toContain("Check your email");
  });

  it("generates a magic link for existing user", async () => {
    const req = createRequest({ email: "test@example.com" });
    await POST(req, dummyCtx);

    expect(mockedGenerateMagicLink).toHaveBeenCalledWith("test@example.com");
  });

  it("returns same success response when user does NOT exist (anti-enumeration)", async () => {
    // User not found
    mockUserSelect.mockResolvedValue(null);

    const req = createRequest({ email: "noone@example.com" });
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("Check your email");
  });

  it("does NOT call generateMagicLink when user does not exist", async () => {
    mockUserSelect.mockResolvedValue(null);

    const req = createRequest({ email: "noone@example.com" });
    await POST(req, dummyCtx);

    expect(mockedGenerateMagicLink).not.toHaveBeenCalled();
  });

  it("returns 400 with invalid email format", async () => {
    const req = createRequest({ email: "not-an-email" });
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when email field is missing", async () => {
    const req = createRequest({});
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when email is empty string", async () => {
    const req = createRequest({ email: "" });
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("normalizes email to lowercase before querying", async () => {
    const req = createRequest({ email: "Test@Example.COM" });
    await POST(req, dummyCtx);

    // The route calls User.findOne with email.toLowerCase().trim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findOneArg = (mockUserFindOne.mock.calls[0] as any)?.[0] as { email: string };
    expect(findOneArg.email).toBe("test@example.com");
  });

  it("calls checkRateLimit with 'auth' group", async () => {
    const req = createRequest({ email: "test@example.com" });
    await POST(req, dummyCtx);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "auth");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const { RateLimitError } = await import("@/lib/api/errors");
    mockedCheckRateLimit.mockRejectedValue(new RateLimitError(60));

    const req = createRequest({ email: "test@example.com" });
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    // withHandler recognises RateLimitError (extends AppError) and returns 429
    expect(response.status).toBe(429);
    expect(body.success).toBe(false);
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockUserFindOne.mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const req = createRequest({ email: "test@example.com" });
    const response = await POST(req, dummyCtx);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("response for existing and non-existing users is identical in shape", async () => {
    // User exists
    mockUserSelect.mockResolvedValue({
      _id: "user-123",
      name: "Test",
      displayName: "Test",
    });
    const reqExisting = createRequest({ email: "exists@example.com" });
    const resExisting = await POST(reqExisting, dummyCtx);
    const bodyExisting = await resExisting.json();

    vi.clearAllMocks();
    mockedCheckRateLimit.mockResolvedValue(undefined);

    // User does not exist
    mockUserSelect.mockResolvedValue(null);
    const reqMissing = createRequest({ email: "missing@example.com" });
    const resMissing = await POST(reqMissing, dummyCtx);
    const bodyMissing = await resMissing.json();

    // Same HTTP status and same message — prevents user enumeration
    expect(resExisting.status).toBe(resMissing.status);
    expect(bodyExisting.message).toBe(bodyMissing.message);
  });
});

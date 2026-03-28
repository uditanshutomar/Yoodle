import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const mockFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: { findById: mockFindById },
}));

vi.mock("@/lib/infra/crypto/encryption", () => ({
  decrypt: vi.fn((val: string) => `decrypted-${val}`),
  encrypt: vi.fn((val: string) => `encrypted-${val}`),
  maskApiKey: vi.fn((val: string) => `${val.slice(0, 4)}•••`),
}));

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

function mockUserWithKey(deepgramKey?: string) {
  mockFindById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        apiKeys: deepgramKey ? { deepgram: deepgramKey } : {},
      }),
    }),
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/stt/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    process.env.DEEPGRAM_API_KEY = "platform-deepgram-key";
  });

  it("returns user BYOK key when configured", async () => {
    mockUserWithKey("encrypted-user-key");

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.source).toBe("user");
  });

  it("falls back to platform key when user has no BYOK key", async () => {
    mockUserWithKey();

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.key).toBe("platform-deepgram-key");
    expect(body.data.source).toBe("platform");
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 500 when no key is available", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    mockUserWithKey();

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    expect(response.status).toBe(500);
  });

  it("falls back to platform key when DB lookup fails", async () => {
    mockFindById.mockImplementation(() => { throw new Error("DB down"); });

    const response = await POST(createRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.key).toBe("platform-deepgram-key");
    expect(body.data.source).toBe("platform");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

const mockGetGoogleAuthUrl = vi.fn();
vi.mock("@/lib/infra/auth/google", () => ({
  getGoogleAuthUrl: (...args: unknown[]) => mockGetGoogleAuthUrl(...args),
}));

function createRequest(redirect?: string): NextRequest {
  const params = new URLSearchParams();
  if (redirect !== undefined) params.set("redirect", redirect);
  const url = `http://localhost:3000/api/auth/google?${params.toString()}`;
  return new NextRequest(url, { method: "GET" });
}

const { GET } = await import("../route");

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGoogleAuthUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?state=test"
    );
  });

  it("returns a Google OAuth URL with success response", async () => {
    const res = await GET(createRequest(), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.url).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=test"
    );
  });

  it("calls getGoogleAuthUrl with state containing nonce and default redirect", async () => {
    await GET(createRequest(), { params: Promise.resolve({}) });

    expect(mockGetGoogleAuthUrl).toHaveBeenCalledTimes(1);
    const stateArg = mockGetGoogleAuthUrl.mock.calls[0][0];
    const state = JSON.parse(stateArg);
    expect(state.nonce).toBeDefined();
    expect(typeof state.nonce).toBe("string");
    expect(state.nonce.length).toBe(32); // 16 bytes hex
    expect(state.redirect).toBe("/dashboard");
  });

  it("includes custom redirect path in OAuth state", async () => {
    await GET(createRequest("/settings"), { params: Promise.resolve({}) });

    const stateArg = mockGetGoogleAuthUrl.mock.calls[0][0];
    const state = JSON.parse(stateArg);
    expect(state.redirect).toBe("/settings");
  });

  it("sets yoodle-oauth-nonce cookie with correct options", async () => {
    const res = await GET(createRequest(), { params: Promise.resolve({}) });

    const setCookie = res.headers.getSetCookie();
    const nonceCookie = setCookie.find((c: string) =>
      c.startsWith("yoodle-oauth-nonce=")
    );
    expect(nonceCookie).toBeDefined();
    expect(nonceCookie).toContain("HttpOnly");
    expect(nonceCookie?.toLowerCase()).toContain("samesite=lax");
    expect(nonceCookie).toContain("Path=/");
    expect(nonceCookie).toContain("Max-Age=600");
  });

  it("generates a unique nonce for each request", async () => {
    await GET(createRequest(), { params: Promise.resolve({}) });
    const state1 = JSON.parse(mockGetGoogleAuthUrl.mock.calls[0][0]);

    await GET(createRequest(), { params: Promise.resolve({}) });
    const state2 = JSON.parse(mockGetGoogleAuthUrl.mock.calls[1][0]);

    expect(state1.nonce).not.toBe(state2.nonce);
  });

  it("rejects absolute URL redirect (protocol injection)", async () => {
    const res = await GET(
      createRequest("https://evil.com"),
      { params: Promise.resolve({}) }
    );

    // withHandler catches ZodError and returns 400
    expect(res.status).toBe(400);
  });

  it("rejects protocol-relative redirect (//evil.com)", async () => {
    const res = await GET(
      createRequest("//evil.com"),
      { params: Promise.resolve({}) }
    );

    expect(res.status).toBe(400);
  });

  it("rejects redirect with embedded protocol (foo://bar)", async () => {
    const res = await GET(
      createRequest("/foo://bar"),
      { params: Promise.resolve({}) }
    );

    expect(res.status).toBe(400);
  });

  it("rate limits requests", async () => {
    const { checkRateLimit } = await import("@/lib/infra/api/rate-limit");

    await GET(createRequest(), { params: Promise.resolve({}) });

    expect(checkRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "auth");
  });
});

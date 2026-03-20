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

const mockExchangeCodeForTokens = vi.fn();
const mockGetGoogleUserProfile = vi.fn();
vi.mock("@/lib/infra/auth/google", () => ({
  exchangeCodeForTokens: (...args: unknown[]) =>
    mockExchangeCodeForTokens(...args),
  getGoogleUserProfile: (...args: unknown[]) =>
    mockGetGoogleUserProfile(...args),
}));

vi.mock("@/lib/infra/auth/jwt", () => ({
  signAccessToken: vi.fn().mockResolvedValue("access-token-123"),
  signRefreshToken: vi.fn().mockResolvedValue("refresh-token-123"),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-refresh-token") },
}));

const mockFindOne = vi.fn();
const mockFindByIdAndUpdate = vi.fn().mockResolvedValue(undefined);
const mockCreate = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

const defaultTokens = {
  access_token: "google-access-token",
  refresh_token: "google-refresh-token",
  expiry_date: Date.now() + 3600 * 1000,
  scope: "openid email profile",
};

const defaultProfile = {
  googleId: "google-123",
  email: "user@example.com",
  name: "Test User",
  avatarUrl: "https://lh3.googleusercontent.com/photo.jpg",
};

const existingUser = {
  _id: { toString: () => TEST_USER_ID },
  email: "user@example.com",
  googleId: "google-123",
  googleTokens: { refreshToken: "old-refresh-token" },
  mode: "social",
  avatarUrl: "https://existing-avatar.jpg",
};

function createCallbackRequest(params: {
  code?: string;
  state?: string;
  error?: string;
  nonceCookie?: string;
}): NextRequest {
  const searchParams = new URLSearchParams();
  if (params.code) searchParams.set("code", params.code);
  if (params.state) searchParams.set("state", params.state);
  if (params.error) searchParams.set("error", params.error);

  const url = `http://localhost:3000/api/auth/google/callback?${searchParams.toString()}`;
  const headers: Record<string, string> = {};
  if (params.nonceCookie) {
    headers.cookie = `yoodle-oauth-nonce=${params.nonceCookie}`;
  }

  return new NextRequest(url, { method: "GET", headers });
}

function makeState(nonce: string, redirect?: string): string {
  return JSON.stringify({ nonce, redirect: redirect || "/dashboard" });
}

const { GET } = await import("../route");

describe("GET /api/auth/google/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForTokens.mockResolvedValue(defaultTokens);
    mockGetGoogleUserProfile.mockResolvedValue(defaultProfile);
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      _id: { toString: () => TEST_USER_ID },
      email: "user@example.com",
    });
  });

  // ── Error parameter handling ────────────────────────────────────────
  it("redirects to login with google_denied when error param is present", async () => {
    const req = createCallbackRequest({ error: "access_denied" });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("error=google_denied");
  });

  // ── Missing code ────────────────────────────────────────────────────
  it("redirects to login with google_no_code when code is missing", async () => {
    const req = createCallbackRequest({});
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("error=google_no_code");
  });

  // ── CSRF nonce mismatch ─────────────────────────────────────────────
  it("redirects to login with google_csrf_failed when nonce does not match", async () => {
    const state = makeState("correct-nonce");
    const req = createCallbackRequest({
      code: "auth-code",
      state,
      nonceCookie: "wrong-nonce",
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=google_csrf_failed");
  });

  it("redirects to login with google_csrf_failed when nonce cookie is missing", async () => {
    const state = makeState("some-nonce");
    const req = createCallbackRequest({ code: "auth-code", state });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=google_csrf_failed");
  });

  // ── Token exchange failure ──────────────────────────────────────────
  it("redirects to login with google_token_failed when access_token is missing", async () => {
    mockExchangeCodeForTokens.mockResolvedValue({ access_token: null });
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=google_token_failed");
  });

  it("redirects to login with google_auth_failed when token exchange throws", async () => {
    mockExchangeCodeForTokens.mockRejectedValue(new Error("Network error"));
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("error=google_auth_failed");
  });

  // ── Successful new user creation ────────────────────────────────────
  it("creates a new user and redirects to dashboard on success", async () => {
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/dashboard");

    // Verify new user was created
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.email).toBe("user@example.com");
    expect(createArg.name).toBe("Test User");
    expect(createArg.googleId).toBe("google-123");
    expect(createArg.status).toBe("online");
  });

  // ── Successful existing user login ──────────────────────────────────
  it("updates an existing user instead of creating a new one", async () => {
    mockFindOne.mockResolvedValue({ ...existingUser });
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    expect(mockCreate).not.toHaveBeenCalled();
    // findByIdAndUpdate called twice: once to update profile/tokens, once for refreshTokenHash
    expect(mockFindByIdAndUpdate).toHaveBeenCalled();
  });

  it("preserves existing refresh token when Google does not return a new one", async () => {
    mockExchangeCodeForTokens.mockResolvedValue({
      ...defaultTokens,
      refresh_token: undefined,
    });
    mockFindOne.mockResolvedValue({ ...existingUser });
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    await GET(req, { params: Promise.resolve({}) });

    // The first findByIdAndUpdate call updates profile/tokens
    const updateCall = mockFindByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1].$set;
    expect(updateData.googleTokens.refreshToken).toBe("old-refresh-token");
  });

  // ── JWT cookies set correctly ───────────────────────────────────────
  it("sets access and refresh token cookies on successful auth", async () => {
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    const setCookies = res.headers.getSetCookie();
    const accessCookie = setCookies.find((c: string) =>
      c.startsWith("yoodle-access-token=")
    );
    const refreshCookie = setCookies.find((c: string) =>
      c.startsWith("yoodle-refresh-token=")
    );

    expect(accessCookie).toBeDefined();
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("Max-Age=900"); // 15 * 60

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("Max-Age=604800"); // 7 * 24 * 60 * 60
  });

  it("deletes the oauth nonce cookie after successful auth", async () => {
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    const setCookies = res.headers.getSetCookie();
    const nonceCookie = setCookies.find((c: string) =>
      c.startsWith("yoodle-oauth-nonce=")
    );
    // Cookie deletion sets Max-Age=0 or expires in the past
    expect(nonceCookie).toBeDefined();
    expect(nonceCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  // ── Custom redirect ─────────────────────────────────────────────────
  it("redirects to custom path from state", async () => {
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce, "/settings"),
      nonceCookie: nonce,
    });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/settings");
  });

  // ── No state → CSRF rejection ─────────────────────────────────────
  it("rejects requests with missing state parameter as CSRF failure", async () => {
    const req = createCallbackRequest({ code: "auth-code" });
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("google_csrf_failed");
  });

  // ── User mode → status mapping ─────────────────────────────────────
  it("sets status to dnd for lockin mode users", async () => {
    mockFindOne.mockResolvedValue({ ...existingUser, mode: "lockin" });
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    await GET(req, { params: Promise.resolve({}) });

    const updateCall = mockFindByIdAndUpdate.mock.calls[0];
    expect(updateCall[1].$set.status).toBe("dnd");
  });

  it("sets status to offline for invisible mode users", async () => {
    mockFindOne.mockResolvedValue({ ...existingUser, mode: "invisible" });
    const nonce = "valid-nonce";
    const req = createCallbackRequest({
      code: "auth-code",
      state: makeState(nonce),
      nonceCookie: nonce,
    });
    await GET(req, { params: Promise.resolve({}) });

    const updateCall = mockFindByIdAndUpdate.mock.calls[0];
    expect(updateCall[1].$set.status).toBe("offline");
  });

  // ── Rate limiting ──────────────────────────────────────────────────
  it("calls rate limiter with auth group", async () => {
    const { checkRateLimit } = await import("@/lib/infra/api/rate-limit");
    const req = createCallbackRequest({ code: "auth-code" });
    await GET(req, { params: Promise.resolve({}) });

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "auth"
    );
  });
});

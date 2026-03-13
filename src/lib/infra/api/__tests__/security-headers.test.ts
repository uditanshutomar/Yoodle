/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jose before importing middleware
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
const mockedJwtVerify = vi.mocked(jwtVerify);

// We'll import the middleware dynamically to ensure mocks are in place
const SECURITY_HEADERS = [
  "X-Frame-Options",
  "X-Content-Type-Options",
  "X-XSS-Protection",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
];

describe("Security Headers in Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test-jwt-secret-key-for-testing";
  });

  it("applies security headers to unprotected routes", async () => {
    // Dynamic import to pick up mocks
    const { middleware } = await import("@/middleware");

    const req = new Request("http://localhost:3000/login", {
      method: "GET",
    }) as any;
    req.nextUrl = new URL("http://localhost:3000/login");
    req.cookies = { get: () => undefined };

    const response = await middleware(req);

    for (const header of SECURITY_HEADERS) {
      expect(response.headers.get(header)).toBeTruthy();
    }
  });

  it("sets X-Frame-Options to SAMEORIGIN", async () => {
    const { middleware } = await import("@/middleware");

    const req = new Request("http://localhost:3000/", {
      method: "GET",
    }) as any;
    req.nextUrl = new URL("http://localhost:3000/");
    req.cookies = { get: () => undefined };

    const response = await middleware(req);
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("sets X-Content-Type-Options to nosniff", async () => {
    const { middleware } = await import("@/middleware");

    const req = new Request("http://localhost:3000/", {
      method: "GET",
    }) as any;
    req.nextUrl = new URL("http://localhost:3000/");
    req.cookies = { get: () => undefined };

    const response = await middleware(req);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets HSTS with includeSubDomains and preload", async () => {
    const { middleware } = await import("@/middleware");

    const req = new Request("http://localhost:3000/", {
      method: "GET",
    }) as any;
    req.nextUrl = new URL("http://localhost:3000/");
    req.cookies = { get: () => undefined };

    const response = await middleware(req);
    const hsts = response.headers.get("Strict-Transport-Security");
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("applies security headers to authenticated route responses", async () => {
    const { middleware } = await import("@/middleware");

    mockedJwtVerify.mockResolvedValue({
      payload: { userId: "user-123", type: "access" },
      protectedHeader: { alg: "HS256" },
    } as any);

    const req = new Request("http://localhost:3000/dashboard", {
      method: "GET",
    }) as any;
    req.nextUrl = new URL("http://localhost:3000/dashboard");
    req.cookies = { get: (name: string) => name === "yoodle-access-token" ? { value: "valid-token" } : undefined };

    const response = await middleware(req);

    for (const header of SECURITY_HEADERS) {
      expect(response.headers.get(header)).toBeTruthy();
    }
  });

  it("applies security headers to redirect responses (unauthenticated)", async () => {
    const { middleware } = await import("@/middleware");

    // Use Object.create to avoid the read-only `url` getter issue
    const baseReq = new Request("http://localhost:3000/dashboard", {
      method: "GET",
    });
    const req = Object.create(baseReq, {
      nextUrl: { value: new URL("http://localhost:3000/dashboard"), writable: true },
      url: { value: "http://localhost:3000/dashboard", writable: true },
      cookies: { value: { get: () => undefined }, writable: true },
    });

    const response = await middleware(req);

    // Even redirects should have security headers
    for (const header of SECURITY_HEADERS) {
      expect(response.headers.get(header)).toBeTruthy();
    }
  });
});

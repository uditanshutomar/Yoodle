import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "../with-handler";

// Mock the logger
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createNextRequest(options: {
  method?: string;
  url?: string;
  origin?: string;
  host?: string;
} = {}): NextRequest {
  const { method = "GET", url = "http://localhost:3000/api/test", origin, host } = options;
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  if (host) headers.set("Host", host);

  return new NextRequest(url, { method, headers });
}

describe("withHandler", () => {
  describe("CSRF protection", () => {
    const successHandler = async () => NextResponse.json({ ok: true });

    it("allows GET requests without Origin header", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({ method: "GET" });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(200);
    });

    it("allows POST requests without Origin header (same-origin by default)", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({ method: "POST" });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(200);
    });

    it("allows POST requests with same-origin Origin header", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/test",
        origin: "http://localhost:3000",
        host: "localhost:3000",
      });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(200);
    });

    it("blocks POST requests with cross-origin Origin header", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/test",
        origin: "http://evil-site.com",
        host: "localhost:3000",
      });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(403);
    });

    it("blocks PATCH requests with cross-origin Origin header", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({
        method: "PATCH",
        url: "http://localhost:3000/api/test",
        origin: "http://attacker.com",
        host: "localhost:3000",
      });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(403);
    });

    it("blocks DELETE requests with cross-origin Origin header", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({
        method: "DELETE",
        url: "http://localhost:3000/api/test",
        origin: "http://attacker.com",
        host: "localhost:3000",
      });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(403);
    });

    it("handles localhost/127.0.0.1 equivalence", async () => {
      const handler = withHandler(successHandler);
      const req = createNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/test",
        origin: "http://127.0.0.1:3000",
        host: "localhost:3000",
      });
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(200);
    });
  });

  describe("error handling", () => {
    it("returns 400 for ZodError", async () => {
      const { ZodError } = await import("zod");
      const handler = withHandler(async () => {
        throw new ZodError([
          { code: "invalid_type", expected: "string", path: ["name"], message: "Expected string" } as never,
        ]);
      });
      const req = createNextRequest();
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(400);
    });

    it("returns 500 for unknown errors without leaking details", async () => {
      const handler = withHandler(async () => {
        throw new Error("Sensitive database connection string leaked");
      });
      const req = createNextRequest();
      const context = { params: Promise.resolve({}) };

      const response = await handler(req, context);
      expect(response.status).toBe(500);

      const body = await response.json();
      // Should NOT contain the actual error message
      expect(JSON.stringify(body)).not.toContain("Sensitive database");
    });
  });
});

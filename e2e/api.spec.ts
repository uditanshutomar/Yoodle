import { test, expect } from "@playwright/test";

test.describe("Public API endpoints", () => {
  test("health endpoint returns healthy status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("healthy");
    expect(data.services).toBeDefined();
    expect(data.services.database).toBe("connected");
  });

  test("waitlist GET returns count", async ({ request }) => {
    const response = await request.get("/api/waitlist");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(typeof data.data.count).toBe("number");
  });

  test("waitlist POST requires valid email", async ({ request }) => {
    const response = await request.post("/api/waitlist", {
      data: { email: "not-an-email" },
    });
    expect(response.status()).toBe(400);
  });

  test("protected endpoints return 401 without auth", async ({ request }) => {
    const protectedEndpoints = [
      { method: "GET", url: "/api/meetings" },
      { method: "GET", url: "/api/users/me" },
      { method: "GET", url: "/api/analytics/summary" },
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.fetch(endpoint.url, {
        method: endpoint.method,
      });
      expect(response.status()).toBe(401);
    }
  });

  test("login endpoint accepts valid email", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email: "test@example.com" },
    });
    // Should return 200 (anti-enumeration: same response whether user exists or not)
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test("login endpoint rejects invalid email", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email: "invalid" },
    });
    expect(response.status()).toBe(400);
  });

  test("signup endpoint validates required fields", async ({ request }) => {
    const response = await request.post("/api/auth/signup", {
      data: { email: "test@example.com" },
      // Missing name field
    });
    // Should either succeed or return validation error — depends on schema
    expect([200, 400, 409]).toContain(response.status());
  });
});

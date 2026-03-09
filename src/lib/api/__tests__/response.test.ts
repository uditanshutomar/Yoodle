import { describe, it, expect } from "vitest";
import {
  successResponse,
  errorResponse,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
  internalError,
} from "../response";

describe("successResponse", () => {
  it("returns a JSON response with success: true and data", async () => {
    const data = { id: "123", name: "Test Meeting" };
    const response = successResponse(data);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(data);
  });

  it("uses the provided status code", async () => {
    const response = successResponse({ created: true }, 201);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("handles null data", async () => {
    const response = successResponse(null);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it("handles array data", async () => {
    const data = [{ id: "1" }, { id: "2" }];
    const response = successResponse(data);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(data);
    expect(body.data).toHaveLength(2);
  });
});

describe("errorResponse", () => {
  it("returns a JSON response with success: false and error info", async () => {
    const response = errorResponse("SOME_ERROR", "Something failed", 500);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("SOME_ERROR");
    expect(body.error.message).toBe("Something failed");
  });

  it("defaults to status 500", async () => {
    const response = errorResponse("ERROR", "Oops");

    expect(response.status).toBe(500);
  });

  it("includes details when provided", async () => {
    const details = { field: "email" };
    const response = errorResponse("VALIDATION", "Invalid", 400, details);

    const body = await response.json();
    expect(body.error.details).toEqual(details);
  });

  it("excludes details when not provided", async () => {
    const response = errorResponse("ERROR", "Fail", 500);

    const body = await response.json();
    expect(body.error.details).toBeUndefined();
  });
});

describe("badRequest", () => {
  it("returns 400 with BAD_REQUEST code", async () => {
    const response = badRequest();

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toBe("Bad request");
  });

  it("accepts a custom message and details", async () => {
    const response = badRequest("Invalid email", { field: "email" });

    const body = await response.json();
    expect(body.error.message).toBe("Invalid email");
    expect(body.error.details).toEqual({ field: "email" });
  });
});

describe("unauthorized", () => {
  it("returns 401 with UNAUTHORIZED code", async () => {
    const response = unauthorized();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Unauthorized");
  });

  it("accepts a custom message", async () => {
    const response = unauthorized("Token expired");

    const body = await response.json();
    expect(body.error.message).toBe("Token expired");
  });
});

describe("forbidden", () => {
  it("returns 403 with FORBIDDEN code", async () => {
    const response = forbidden();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Forbidden");
  });
});

describe("notFound", () => {
  it("returns 404 with NOT_FOUND code", async () => {
    const response = notFound();

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Not found");
  });
});

describe("conflict", () => {
  it("returns 409 with CONFLICT code", async () => {
    const response = conflict();

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Conflict");
  });
});

describe("tooManyRequests", () => {
  it("returns 429 with TOO_MANY_REQUESTS code", async () => {
    const response = tooManyRequests();

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(body.error.message).toBe("Too many requests");
  });

  it("sets Retry-After header when retryAfter is provided", () => {
    const response = tooManyRequests(60);

    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("does not set Retry-After header when not provided", () => {
    const response = tooManyRequests();

    expect(response.headers.get("Retry-After")).toBeNull();
  });
});

describe("internalError", () => {
  it("returns 500 with INTERNAL_ERROR code", async () => {
    const response = internalError();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal server error");
  });

  it("accepts a custom message", async () => {
    const response = internalError("Database connection failed");

    const body = await response.json();
    expect(body.error.message).toBe("Database connection failed");
  });
});

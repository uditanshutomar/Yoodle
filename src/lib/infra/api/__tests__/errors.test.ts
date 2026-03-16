import { describe, it, expect } from "vitest";
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "../errors";

describe("AppError", () => {
  it("creates an error with the correct properties", () => {
    const error = new AppError("Something went wrong", "CUSTOM_ERROR", 500);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe("Something went wrong");
    expect(error.code).toBe("CUSTOM_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe("AppError");
    expect(error.details).toBeUndefined();
  });

  it("stores optional details", () => {
    const details = { field: "email", reason: "invalid format" };
    const error = new AppError("Validation failed", "VALIDATION", 422, details);

    expect(error.details).toEqual(details);
  });
});

describe("BadRequestError", () => {
  it("has status code 400 and code BAD_REQUEST", () => {
    const error = new BadRequestError();

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.name).toBe("BadRequestError");
    expect(error.message).toBe("Bad request");
  });

  it("accepts a custom message", () => {
    const error = new BadRequestError("Invalid email");

    expect(error.message).toBe("Invalid email");
  });

  it("accepts details", () => {
    const details = { fields: ["email"] };
    const error = new BadRequestError("Validation failed", details);

    expect(error.details).toEqual(details);
  });
});

describe("UnauthorizedError", () => {
  it("has status code 401 and code UNAUTHORIZED", () => {
    const error = new UnauthorizedError();

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.name).toBe("UnauthorizedError");
    expect(error.message).toBe("Unauthorized");
  });

  it("accepts a custom message", () => {
    const error = new UnauthorizedError("Token expired");

    expect(error.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("has status code 403 and code FORBIDDEN", () => {
    const error = new ForbiddenError();

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.name).toBe("ForbiddenError");
    expect(error.message).toBe("Forbidden");
  });

  it("accepts a custom message", () => {
    const error = new ForbiddenError("Insufficient permissions");

    expect(error.message).toBe("Insufficient permissions");
  });
});

describe("NotFoundError", () => {
  it("has status code 404 and code NOT_FOUND", () => {
    const error = new NotFoundError();

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.name).toBe("NotFoundError");
    expect(error.message).toBe("Not found");
  });

  it("accepts a custom message", () => {
    const error = new NotFoundError("Meeting not found");

    expect(error.message).toBe("Meeting not found");
  });
});

describe("RateLimitError", () => {
  it("has status code 429 and code TOO_MANY_REQUESTS", () => {
    const error = new RateLimitError();

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("TOO_MANY_REQUESTS");
    expect(error.name).toBe("RateLimitError");
    expect(error.message).toBe("Too many requests");
  });

  it("stores retryAfter value", () => {
    const error = new RateLimitError(30);

    expect(error.retryAfter).toBe(30);
  });

  it("has undefined retryAfter when not provided", () => {
    const error = new RateLimitError();

    expect(error.retryAfter).toBeUndefined();
  });
});

describe("Error inheritance", () => {
  it("all custom errors are instances of AppError", () => {
    expect(new BadRequestError()).toBeInstanceOf(AppError);
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
    expect(new NotFoundError()).toBeInstanceOf(AppError);
    expect(new RateLimitError()).toBeInstanceOf(AppError);
  });

  it("all custom errors are instances of Error", () => {
    expect(new BadRequestError()).toBeInstanceOf(Error);
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
    expect(new ForbiddenError()).toBeInstanceOf(Error);
    expect(new NotFoundError()).toBeInstanceOf(Error);
    expect(new RateLimitError()).toBeInstanceOf(Error);
  });
});

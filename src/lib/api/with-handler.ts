import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createLogger } from "../logger";
import { AppError, RateLimitError } from "./errors";
import { errorResponse, internalError } from "./response";

const log = createLogger("api");

type InnerHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse | Response>;

type NextRouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse | Response>;

/**
 * Wraps an API route handler with standardized error handling and logging.
 *
 * Usage:
 *   export const GET = withHandler(async (req) => {
 *     // ... your logic
 *     return successResponse(data);
 *   });
 */
export function withHandler(handler: InnerHandler): NextRouteHandler {
  return async (req, context) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID().slice(0, 8);

    try {
      const response = await handler(req, context);

      log.info(
        {
          requestId,
          method: req.method,
          url: req.nextUrl.pathname,
          status: response.status,
          duration: Date.now() - startTime,
        },
        `${req.method} ${req.nextUrl.pathname} → ${response.status}`,
      );

      return response;
    } catch (error) {
      return handleError(error, req, requestId, startTime);
    }
  };
}

function handleError(
  error: unknown,
  req: NextRequest,
  requestId: string,
  startTime: number,
): NextResponse {
  // Known application errors
  if (error instanceof AppError) {
    log.warn(
      {
        requestId,
        method: req.method,
        url: req.nextUrl.pathname,
        errorCode: error.code,
        statusCode: error.statusCode,
        duration: Date.now() - startTime,
      },
      `${req.method} ${req.nextUrl.pathname} → ${error.statusCode}: ${error.message}`,
    );

    const response = errorResponse(
      error.code,
      error.message,
      error.statusCode,
      error.details,
    );

    if (error instanceof RateLimitError && error.retryAfter) {
      response.headers.set("Retry-After", String(error.retryAfter));
    }

    return response;
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    log.warn(
      {
        requestId,
        method: req.method,
        url: req.nextUrl.pathname,
        issues: error.issues,
        duration: Date.now() - startTime,
      },
      `${req.method} ${req.nextUrl.pathname} → 400: Validation error`,
    );

    return errorResponse("VALIDATION_ERROR", "Validation failed", 400, {
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  // Unknown errors
  log.error(
    {
      requestId,
      method: req.method,
      url: req.nextUrl.pathname,
      err: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime,
    },
    `${req.method} ${req.nextUrl.pathname} → 500: Unhandled error`,
  );

  return internalError();
}

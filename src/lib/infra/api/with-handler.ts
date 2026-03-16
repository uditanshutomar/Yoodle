import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
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
      // CSRF protection: verify Origin/Referer on state-changing methods
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        const origin = req.headers.get("origin");
        // Fall back to Referer when Origin is absent (e.g. some browsers, redirect chains)
        const referer = req.headers.get("referer");
        let sourceOrigin: string | null = origin;
        if (!sourceOrigin && referer) {
          try {
            sourceOrigin = new URL(referer).origin;
          } catch {
            sourceOrigin = null;
          }
        }

        if (!sourceOrigin) {
          // Neither Origin nor Referer present — reject state-changing request
          log.warn(
            { requestId, method: req.method, url: req.nextUrl.pathname },
            "CSRF: No Origin or Referer header on state-changing request",
          );
          return errorResponse("FORBIDDEN", "Missing request origin", 403);
        }

        // Build allowed origins from environment config only (not from request headers)
        const allowedOrigins = new Set<string>();

        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (appUrl) {
          try {
            allowedOrigins.add(new URL(appUrl).origin);
          } catch {
            log.warn({ requestId, appUrl }, "CSRF: Invalid NEXT_PUBLIC_APP_URL");
          }
        }

        // Allow the request URL origin (derived by Next.js, not attacker-controlled)
        allowedOrigins.add(new URL(req.url).origin);

        // In development, also derive from Host header for convenience (e.g. port changes)
        if (process.env.NODE_ENV !== "production") {
          const host = req.headers.get("host");
          if (host) {
            const protocol = req.headers.get("x-forwarded-proto") || "http";
            allowedOrigins.add(`${protocol}://${host}`);
          }
        }

        // Normalize localhost ↔ 127.0.0.1 equivalence
        const normalizeLocalhost = (o: string) =>
          o.replace("://localhost", "://127.0.0.1");
        const expandedOrigins = new Set(allowedOrigins);
        for (const o of allowedOrigins) {
          expandedOrigins.add(normalizeLocalhost(o));
          expandedOrigins.add(o.replace("://127.0.0.1", "://localhost"));
        }

        if (!expandedOrigins.has(sourceOrigin)) {
          log.warn(
            { requestId, sourceOrigin, allowed: [...expandedOrigins] },
            "CSRF: Origin mismatch",
          );
          return errorResponse("FORBIDDEN", "Invalid request origin", 403);
        }
      }

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

    // In production, omit field-level details to avoid exposing internal schema.
    // In development, include full details for debugging convenience.
    const details =
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          };

    return errorResponse("VALIDATION_ERROR", "Validation failed", 400, details);
  }

  // Unknown errors — report to Sentry with request context
  Sentry.captureException(error, {
    tags: {
      requestId,
      method: req.method,
      route: req.nextUrl.pathname,
    },
    extra: {
      duration: Date.now() - startTime,
    },
  });

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

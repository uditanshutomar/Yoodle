import { NextResponse } from "next/server";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/types/api";

// ── Positional-argument helpers (preferred for new code) ────────────

export function successResponse<T>(
  data: T,
  status?: number
): NextResponse<ApiSuccessResponse<T>>;
export function successResponse<T>(
  opts: SuccessResponseOptions<T>
): NextResponse<ApiSuccessResponse<T>>;
export function successResponse<T>(
  dataOrOpts: T | SuccessResponseOptions<T>,
  statusArg?: number
): NextResponse<ApiSuccessResponse<T>> {
  // Detect legacy object-style call: { data?, message?, status? }
  if (
    dataOrOpts !== null &&
    typeof dataOrOpts === "object" &&
    !Array.isArray(dataOrOpts) &&
    ("message" in (dataOrOpts as Record<string, unknown>) ||
      ("data" in (dataOrOpts as Record<string, unknown>) &&
        "status" in (dataOrOpts as Record<string, unknown>)))
  ) {
    const opts = dataOrOpts as SuccessResponseOptions<T>;
    const payload: Record<string, unknown> = { success: true };
    if (opts.message) payload.message = opts.message;
    if (opts.data !== undefined) payload.data = opts.data;
    return NextResponse.json(payload as unknown as ApiSuccessResponse<T>, {
      status: opts.status ?? 200,
    });
  }

  // Positional-argument style
  return NextResponse.json(
    { success: true as const, data: dataOrOpts as T },
    { status: statusArg ?? 200 }
  );
}

export function errorResponse(
  message: string,
  status?: number
): NextResponse<ApiErrorResponse>;
export function errorResponse(
  opts: ErrorResponseOptions
): NextResponse<ApiErrorResponse>;
export function errorResponse(
  messageOrOpts: string | ErrorResponseOptions,
  statusArg?: number
): NextResponse<ApiErrorResponse> {
  if (typeof messageOrOpts === "string") {
    return NextResponse.json(
      { success: false as const, error: messageOrOpts },
      { status: statusArg ?? 400 }
    );
  }

  const opts = messageOrOpts;
  const payload: Record<string, unknown> = {
    success: false,
    message: opts.message,
  };
  if (opts.errors) payload.errors = opts.errors;
  // Also set `error` for the ApiErrorResponse shape
  payload.error = opts.message;
  return NextResponse.json(payload as unknown as ApiErrorResponse, {
    status: opts.status ?? 400,
  });
}

// ── Convenience wrappers ────────────────────────────────────────────

export function unauthorizedResponse(
  message = "Authentication required"
): NextResponse<ApiErrorResponse> {
  return errorResponse(message, 401);
}

export function notFoundResponse(
  message = "Resource not found"
): NextResponse<ApiErrorResponse> {
  return errorResponse(message, 404);
}

export function serverErrorResponse(
  message = "Internal server error"
): NextResponse<ApiErrorResponse> {
  return errorResponse(message, 500);
}

// ── Legacy option types (kept for backward compat) ──────────────────

interface SuccessResponseOptions<T = unknown> {
  data?: T;
  message?: string;
  status?: number;
}

interface ErrorResponseOptions {
  message: string;
  status?: number;
  errors?: Record<string, string[]> | unknown;
}

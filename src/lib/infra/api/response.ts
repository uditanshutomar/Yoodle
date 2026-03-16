import { NextResponse } from "next/server";

/**
 * Standardized API response shape.
 * Every API route should return this format.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Return a success response.
 */
export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Return an error response.
 */
export function errorResponse(
  code: string,
  message: string,
  status = 500,
  details?: unknown,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    },
    { status },
  );
}

// ─── Common Error Responses ──────────────────────────────────────────

export function badRequest(message = "Bad request", details?: unknown) {
  return errorResponse("BAD_REQUEST", message, 400, details);
}

export function internalError(message = "Internal server error") {
  return errorResponse("INTERNAL_ERROR", message, 500);
}

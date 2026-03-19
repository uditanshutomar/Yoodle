import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Next.js Proxy (formerly Edge Middleware — renamed in Next.js 16)
 *
 * Protects all /(app)/* routes by requiring a valid access token cookie.
 * Allows all other routes (landing page, auth pages, API routes) through.
 *
 * Note: Token blacklist checks cannot run in the proxy layer (no Redis access).
 * The API-layer authenticateRequest() in src/lib/infra/auth/middleware.ts handles
 * blacklist validation for all API routes. For page routes, tokens are short-lived
 * (15 min) which limits the window after logout.
 */

// Routes that require authentication (the (app) route group)
const PROTECTED_PATHS = [
  "/dashboard",
  "/meetings",
  "/messages",
  "/workspaces",
  "/ghost-rooms", // Ghost room detail pages still exist at /ghost-rooms/[roomId]
  "/settings",
  "/admin",
  "/ai",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function redirectToLogin(request: NextRequest, pathname: string, clearCookie = false) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  const response = NextResponse.redirect(loginUrl);
  if (clearCookie) {
    response.cookies.delete("yoodle-access-token");
    response.cookies.delete({ name: "yoodle-refresh-token", path: "/api/auth" });
    response.cookies.delete({ name: "yoodle-refresh-token", path: "/" });
  }
  return applySecurityHeaders(response);
}

/**
 * Append security headers to every response flowing through middleware.
 *
 * NOTE: These headers mirror next.config.ts securityHeaders[]. If you change
 * values here, update next.config.ts too (it covers static assets that bypass
 * middleware). CSP is only in next.config.ts since it needs build-time env vars.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect app routes - let everything else through
  if (!isProtectedRoute(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const accessToken = request.cookies.get("yoodle-access-token")?.value;

  if (!accessToken) {
    return redirectToLogin(request, pathname);
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET not configured");
    }

    const encodedSecret = new TextEncoder().encode(secret);

    const { payload } = await jwtVerify(accessToken, encodedSecret, {
      issuer: "yoodle",
      audience: "yoodle-app",
    });

    // Verify token type is "access" (not a refresh token being misused)
    if (payload.type !== "access") {
      return redirectToLogin(request, pathname, true);
    }

    // Add user info to request headers for downstream use
    const response = NextResponse.next();
    if (payload.userId) {
      response.headers.set("x-user-id", payload.userId as string);
    }

    return applySecurityHeaders(response);
  } catch (err) {
    // Distinguish expected JWT failures from unexpected errors for observability.
    // Use .code (not .name) — class names are minified in Edge bundles but
    // jose sets explicit .code strings that survive minification.
    const code = (err as { code?: string }).code ?? "";
    const isExpectedJwtError =
      code === "ERR_JWT_EXPIRED" ||
      code === "ERR_JWT_CLAIM_VALIDATION_FAILED" ||
      code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" ||
      code === "ERR_JWS_INVALID";

    if (!isExpectedJwtError) {
      console.error("[middleware] Unexpected error during JWT verification:", err);
    }

    return redirectToLogin(request, pathname, true);
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

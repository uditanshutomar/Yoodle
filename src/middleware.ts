import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Next.js Edge Middleware
 *
 * Protects all /(app)/* routes by requiring a valid access token cookie.
 * Allows all other routes (landing page, auth pages, API routes) through.
 */

// Routes that require authentication (the (app) route group)
const PROTECTED_PATHS = [
  "/dashboard",
  "/meetings",
  "/workspaces",
  "/ghost-rooms",
  "/ai",
  "/settings",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect app routes - let everything else through
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("yoodle-access-token")?.value;

  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET not configured");
    }

    const encodedSecret = new TextEncoder().encode(secret);

    await jwtVerify(accessToken, encodedSecret, {
      issuer: "yoodle",
      audience: "yoodle-app",
    });

    return NextResponse.next();
  } catch {
    // Token is invalid or expired - redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);

    const response = NextResponse.redirect(loginUrl);
    // Clear the invalid cookie
    response.cookies.delete("yoodle-access-token");
    return response;
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

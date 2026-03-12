import { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { tokenIsBlacklisted } from "@/lib/redis/cache";
import { UnauthorizedError } from "@/lib/api/errors";

/**
 * Authenticate an incoming API request by extracting and verifying
 * the access token. Checks in order:
 *   1. Authorization: Bearer <token> header
 *   2. yoodle-access-token cookie (via NextRequest.cookies)
 *   3. yoodle-access-token cookie (via Cookie header parsing)
 *
 * Returns the decoded payload with userId.
 * Throws UnauthorizedError if no valid token is found.
 */
export async function authenticateRequest(
  request: Request,
): Promise<{ userId: string }> {
  let token: string | undefined;

  // 1. Try Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim() || undefined;
  }

  // 2. Try NextRequest cookies API (available in Next.js API routes)
  if (!token && "cookies" in request) {
    const cookieVal = (request as NextRequest).cookies.get("yoodle-access-token");
    if (cookieVal?.value) {
      token = cookieVal.value;
    }
  }

  // 3. Fallback: parse Cookie header manually
  if (!token) {
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/yoodle-access-token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token) {
    throw new UnauthorizedError("Missing authentication credentials.");
  }

  // Check if token has been blacklisted (e.g., on logout)
  const blacklisted = await tokenIsBlacklisted(token);
  if (blacklisted) {
    throw new UnauthorizedError("Token has been revoked.");
  }

  try {
    const payload = await verifyAccessToken(token);
    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error instanceof Error) {
      throw new UnauthorizedError(`Authentication failed: ${error.message}`);
    }
    throw new UnauthorizedError("Authentication failed: Invalid token.");
  }
}

/**
 * Extract the userId from a request.
 * Convenience wrapper around authenticateRequest.
 */
export async function getUserIdFromRequest(
  request: Request,
): Promise<string> {
  const { userId } = await authenticateRequest(request);
  return userId;
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/infra/auth/jwt";
import { tokenBlacklist } from "@/lib/infra/redis/cache";
import { successResponse } from "@/lib/infra/api/response";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("auth:logout");

/**
 * Perform the full logout flow:
 * 1. Blacklist access + refresh tokens (best-effort)
 * 2. Clear the refreshTokenHash + set user offline in DB
 * 3. Return a response with auth cookies cleared
 *
 * Used by both POST /api/auth/logout and DELETE /api/auth/session.
 */
export async function performLogout(req: NextRequest): Promise<NextResponse> {
  const accessToken = req.cookies.get("yoodle-access-token")?.value;
  const refreshToken = req.cookies.get("yoodle-refresh-token")?.value;

  let userId: string | null = null;

  // Blacklist the access token (remaining TTL ~15min max)
  if (accessToken) {
    try {
      const payload = await verifyAccessToken(accessToken);
      userId = payload.userId;
      await tokenBlacklist(accessToken, 15 * 60);
    } catch (err) {
      // Token already expired or invalid — no need to blacklist, but log for audit trail
      log.warn({ err }, "Could not blacklist access token during logout (expired or invalid)");
    }
  }

  // Blacklist the refresh token (remaining TTL ~7 days max)
  if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken);
      if (!userId) userId = payload.userId;
      await tokenBlacklist(refreshToken, 7 * 24 * 60 * 60);
    } catch (err) {
      // Token already expired or invalid — log because a failed refresh token
      // blacklist means the 7-day token could theoretically be reused
      log.warn({ err }, "Could not blacklist refresh token during logout — token may remain valid");
    }
  }

  // Clear refresh token hash and set user offline in DB
  if (userId) {
    try {
      await connectDB();
      await User.findByIdAndUpdate(userId, {
        $unset: { refreshTokenHash: 1 },
        $set: { status: "offline" },
      });
    } catch (err) {
      // Best-effort — don't fail logout, but log the DB failure
      log.error({ err, userId }, "Failed to clear refresh token hash and set user offline during logout");
    }
  }

  const response = successResponse({ message: "Logged out successfully." });
  response.cookies.delete("yoodle-access-token");
  // Delete refresh token at both paths to handle tokens issued before path scoping
  response.cookies.delete({ name: "yoodle-refresh-token", path: "/api/auth" });
  response.cookies.delete({ name: "yoodle-refresh-token", path: "/" });

  return response;
}

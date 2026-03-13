import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { tokenBlacklist } from "@/lib/redis/cache";
import { NotFoundError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";

/**
 * GET /api/auth/session
 * Returns the currently authenticated user's session data.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "session");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const user = await User.findById(userId).select(
    "-refreshTokenHash -__v -googleTokens.accessToken -googleTokens.expiresAt -googleTokens.scope"
  );

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return successResponse({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    location: user.location,
    preferences: user.preferences,
    hasGoogleAccess: !!(user.googleId && user.googleTokens?.refreshToken),
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * DELETE /api/auth/session
 * Logs the user out by clearing auth cookies and blacklisting tokens.
 */
export const DELETE = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  const accessToken = req.cookies.get("yoodle-access-token")?.value;
  const refreshToken = req.cookies.get("yoodle-refresh-token")?.value;

  let userId: string | null = null;

  // Blacklist the access token (remaining TTL ~15min max)
  if (accessToken) {
    try {
      const payload = await verifyAccessToken(accessToken);
      userId = payload.userId;
      await tokenBlacklist(accessToken, 15 * 60);
    } catch {
      // Token already expired or invalid — no need to blacklist
    }
  }

  // Blacklist the refresh token (remaining TTL ~7 days max)
  if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken);
      if (!userId) userId = payload.userId;
      await tokenBlacklist(refreshToken, 7 * 24 * 60 * 60);
    } catch {
      // Token already expired or invalid
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
    } catch {
      // DB update failure shouldn't prevent logout
    }
  }

  const response = successResponse({
    message: "Logged out successfully.",
  });

  // Clear both auth cookies
  response.cookies.delete("yoodle-access-token");
  response.cookies.delete("yoodle-refresh-token");

  return response;
});

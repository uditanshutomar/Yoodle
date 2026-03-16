import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/infra/auth/jwt";
import { tokenBlacklist, tokenIsBlacklisted } from "@/lib/infra/redis/cache";
import { UnauthorizedError } from "@/lib/infra/api/errors";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");
  const refreshTokenCookie = req.cookies.get("yoodle-refresh-token")?.value;

  if (!refreshTokenCookie) {
    throw new UnauthorizedError("No refresh token provided.");
  }

  // Check if refresh token has been blacklisted (fail closed for long-lived refresh tokens)
  const blacklisted = await tokenIsBlacklisted(refreshTokenCookie, { failClosed: true });
  if (blacklisted) {
    // Return error response directly (not throw) so cookie deletions are preserved.
    // Throwing would create a new response in withHandler, discarding these cookies.
    const response = NextResponse.json(
      { success: false, error: "Refresh token has been revoked." },
      { status: 401 },
    );
    response.cookies.delete("yoodle-refresh-token");
    response.cookies.delete("yoodle-access-token");
    return response;
  }

  // Verify the refresh token JWT
  let userId: string;
  try {
    const payload = await verifyRefreshToken(refreshTokenCookie);
    userId = payload.userId;
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token.");
  }

  await connectDB();

  // Find the user and verify the stored refresh token hash — only fetch what's needed
  const user = await User.findById(userId).select("_id refreshTokenHash");

  if (!user || !user.refreshTokenHash) {
    throw new UnauthorizedError("Session not found. Please log in again.");
  }

  // Compare the incoming refresh token with the stored hash
  const isTokenValid = await bcrypt.compare(
    refreshTokenCookie,
    user.refreshTokenHash,
  );

  if (!isTokenValid) {
    // Possible token reuse attack -- invalidate all sessions
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshTokenHash: 1 },
    });
    await tokenBlacklist(refreshTokenCookie, 7 * 24 * 60 * 60);
    throw new UnauthorizedError(
      "Invalid refresh token. All sessions have been revoked.",
    );
  }

  // Generate new token pair
  const newAccessToken = await signAccessToken(userId);
  const newRefreshToken = await signRefreshToken(userId);

  // Blacklist the old refresh token
  await tokenBlacklist(refreshTokenCookie, 7 * 24 * 60 * 60);

  // Store the new refresh token hash
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
  await User.findByIdAndUpdate(userId, {
    refreshTokenHash: newRefreshTokenHash,
    lastSeenAt: new Date(),
  });

  // Build response with new cookies (tokens delivered via httpOnly cookies only, not in body)
  const response = successResponse({
    message: "Tokens refreshed successfully.",
  });

  response.cookies.set("yoodle-access-token", newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

  response.cookies.set("yoodle-refresh-token", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
});

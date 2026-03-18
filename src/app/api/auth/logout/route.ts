import { NextRequest } from "next/server";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/infra/auth/jwt";
import { tokenBlacklist } from "@/lib/infra/redis/cache";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";

export const POST = withHandler(async (req: NextRequest) => {
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
      // Token already expired or invalid -- no need to blacklist
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
      // Best-effort — don't fail logout if DB update fails
    }
  }

  // Build response and clear cookies
  const response = successResponse({ message: "Logged out successfully." });
  response.cookies.delete("yoodle-access-token");
  response.cookies.delete("yoodle-refresh-token");

  return response;
});

import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { performLogout } from "@/lib/infra/auth/logout";
import { NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

/**
 * GET /api/auth/session
 * Returns the currently authenticated user's session data.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "session");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const user = await User.findById(userId)
    .select("-refreshTokenHash -magicLinkToken -magicLinkExpires -__v -googleTokens.accessToken -googleTokens.refreshToken -googleTokens.expiresAt -googleTokens.scope")
    .lean();

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return successResponse({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    mode: user.mode,
    status: user.status,
    location: user.location,
    preferences: user.preferences,
    hasGoogleAccess: !!user.googleId,
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
  return performLogout(req);
});

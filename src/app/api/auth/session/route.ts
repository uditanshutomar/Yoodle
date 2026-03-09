import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { authenticateRequest, getUserIdFromRequest } from "@/lib/auth/middleware";
import { NotFoundError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";

/**
 * GET /api/auth/session
 * Returns the currently authenticated user's session data.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const user = await User.findById(userId).select(
    "-googleTokens -refreshTokenHash -__v"
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
    hasGoogleAccess: !!user.googleId,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

/**
 * DELETE /api/auth/session
 * Logs the user out by clearing auth cookies.
 */
export const DELETE = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  // Optionally clear the refresh token hash from the user doc
  try {
    const payload = await authenticateRequest(req);
    await connectDB();
    await User.findByIdAndUpdate(payload.userId, {
      $unset: { refreshTokenHash: 1 },
      $set: { status: "offline" },
    });
  } catch {
    // Even if auth fails, we still clear cookies
  }

  const response = successResponse({
    message: "Logged out successfully.",
  });

  // Clear both auth cookies
  response.cookies.delete("yoodle-access-token");
  response.cookies.delete("yoodle-refresh-token");

  return response;
});

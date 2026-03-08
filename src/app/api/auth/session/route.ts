import { NextRequest } from "next/server";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

/**
 * GET /api/auth/session
 * Returns the currently authenticated user's session data.
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    await connectDB();

    const user = await User.findById(userId).select(
      "-googleTokens -refreshTokenHash -__v"
    );

    if (!user) {
      return notFoundResponse("User not found.");
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
  } catch (error) {
    console.error("[Session GET Error]", error);
    return serverErrorResponse("Failed to retrieve session.");
  }
}

/**
 * DELETE /api/auth/session
 * Logs the user out by clearing auth cookies.
 */
export async function DELETE(request: NextRequest) {
  try {
    // Optionally clear the refresh token hash from the user doc
    try {
      const payload = await authenticateRequest(request);
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
  } catch (error) {
    console.error("[Session DELETE Error]", error);

    // Still clear cookies on error
    const response = successResponse({
      message: "Logged out.",
    });
    response.cookies.delete("yoodle-access-token");
    response.cookies.delete("yoodle-refresh-token");
    return response;
  }
}

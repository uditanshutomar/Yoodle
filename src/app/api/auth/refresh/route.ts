import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth/jwt";
import {
  successResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

/**
 * POST /api/auth/refresh
 * Rotates the refresh token and issues a new access token.
 * Reads the refresh token from the httpOnly cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const refreshTokenCookie = request.cookies.get(
      "yoodle-refresh-token"
    )?.value;

    if (!refreshTokenCookie) {
      return unauthorizedResponse("No refresh token provided.");
    }

    // Verify the refresh token JWT
    let userId: string;
    try {
      const payload = await verifyRefreshToken(refreshTokenCookie);
      userId = payload.userId;
    } catch {
      const response = unauthorizedResponse(
        "Invalid or expired refresh token."
      );
      response.cookies.delete("yoodle-refresh-token");
      response.cookies.delete("yoodle-access-token");
      return response;
    }

    await connectDB();

    // Find the user and verify the stored refresh token hash
    const user = await User.findById(userId);

    if (!user || !user.refreshTokenHash) {
      const response = unauthorizedResponse(
        "Session not found. Please log in again."
      );
      response.cookies.delete("yoodle-refresh-token");
      response.cookies.delete("yoodle-access-token");
      return response;
    }

    // Compare the incoming refresh token with the stored hash
    const isTokenValid = await bcrypt.compare(
      refreshTokenCookie,
      user.refreshTokenHash
    );

    if (!isTokenValid) {
      // Possible token reuse attack — invalidate all sessions
      await User.findByIdAndUpdate(userId, {
        $unset: { refreshTokenHash: 1 },
      });

      const response = unauthorizedResponse(
        "Invalid refresh token. All sessions have been revoked."
      );
      response.cookies.delete("yoodle-refresh-token");
      response.cookies.delete("yoodle-access-token");
      return response;
    }

    // Generate new token pair
    const newAccessToken = await signAccessToken(userId);
    const newRefreshToken = await signRefreshToken(userId);

    // Store the new refresh token hash
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await User.findByIdAndUpdate(userId, {
      refreshTokenHash: newRefreshTokenHash,
      lastSeenAt: new Date(),
    });

    // Build response with new cookies
    const response = successResponse({
      data: { accessToken: newAccessToken },
      message: "Tokens refreshed successfully.",
    });

    // Set new access token cookie (httpOnly for security)
    response.cookies.set("yoodle-access-token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60, // 15 minutes
    });

    // Set new refresh token cookie
    response.cookies.set("yoodle-refresh-token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("[Refresh Error]", error);
    return serverErrorResponse("Failed to refresh tokens.");
  }
}

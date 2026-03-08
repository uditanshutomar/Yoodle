import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { exchangeCodeForTokens, getGoogleUserProfile } from "@/lib/auth/google";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";

/**
 * GET /api/auth/google/callback
 * Handles the OAuth callback from Google. Creates or updates the user,
 * stores Google tokens for Workspace API access, issues JWT session tokens.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "google_denied");
      return NextResponse.redirect(loginUrl);
    }

    if (!code) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "google_no_code");
      return NextResponse.redirect(loginUrl);
    }

    // Exchange the authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "google_token_failed");
      return NextResponse.redirect(loginUrl);
    }

    // Get the user's Google profile
    const profile = await getGoogleUserProfile(tokens.access_token);

    await connectDB();

    // Find existing user by googleId or email
    let user = await User.findOne({
      $or: [
        { googleId: profile.googleId },
        { email: profile.email.toLowerCase() },
      ],
    });

    const googleTokensData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000),
      scope: tokens.scope || "",
    };

    if (user) {
      // Update existing user with latest Google tokens and profile
      const updateData: Record<string, unknown> = {
        googleId: profile.googleId,
        googleTokens: googleTokensData,
        status: "online",
        lastSeenAt: new Date(),
      };

      // Update avatar if user doesn't have one
      if (!user.avatarUrl && profile.avatarUrl) {
        updateData.avatarUrl = profile.avatarUrl;
      }

      await User.findByIdAndUpdate(user._id, { $set: updateData });
    } else {
      // Create a new user from Google profile
      const baseDisplayName = profile.email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toLowerCase()
        .slice(0, 50);

      user = await User.create({
        email: profile.email.toLowerCase(),
        name: profile.name,
        displayName: baseDisplayName,
        avatarUrl: profile.avatarUrl,
        googleId: profile.googleId,
        googleTokens: googleTokensData,
        status: "online",
        preferences: {
          notifications: true,
          ghostModeDefault: false,
          theme: "auto",
        },
      });
    }

    const userId = user._id.toString();

    // Generate JWT session tokens
    const accessToken = await signAccessToken(userId);
    const refreshToken = await signRefreshToken(userId);

    // Store hashed refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash });

    // Redirect to the requested page (or dashboard)
    // Validate that the redirect target is a relative path to prevent open redirect attacks
    let redirectTo = state || "/dashboard";
    if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
      redirectTo = "/dashboard";
    }
    const redirectUrl = new URL(redirectTo, request.url);
    const response = NextResponse.redirect(redirectUrl);

    // Set JWT cookies
    response.cookies.set("yoodle-access-token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    response.cookies.set("yoodle-refresh-token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("[Google Callback Error]", error);

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(loginUrl);
  }
}

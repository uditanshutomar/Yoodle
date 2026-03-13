import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { exchangeCodeForTokens, getGoogleUserProfile } from "@/lib/infra/auth/google";
import { signAccessToken, signRefreshToken } from "@/lib/infra/auth/jwt";

/**
 * GET /api/auth/google/callback
 * Handles the OAuth callback from Google. Creates or updates the user,
 * stores Google tokens for Workspace API access, issues JWT session tokens.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "google_denied");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "google_no_code");
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Exchange the authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token) {
      const loginUrl = new URL("/login", req.url);
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

    const googleTokensData: Record<string, unknown> = {
      accessToken: tokens.access_token,
      expiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000),
      scope: tokens.scope || "",
    };

    // Only set refreshToken if Google actually returned a new one.
    // On re-authentication Google often omits it, and storing ""
    // would destroy the existing (valid) refresh token.
    if (tokens.refresh_token) {
      googleTokensData.refreshToken = tokens.refresh_token;
    }

    if (user) {
      // Preserve the existing refresh token if Google didn't provide a new one
      if (!tokens.refresh_token && user.googleTokens?.refreshToken) {
        googleTokensData.refreshToken = user.googleTokens.refreshToken;
      }

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

    // Verify CSRF nonce from the OAuth state parameter
    let redirectTo = "/dashboard";
    if (state) {
      try {
        const stateObj = JSON.parse(decodeURIComponent(state));
        const storedNonce = req.cookies.get("yoodle-oauth-nonce")?.value;

        // Validate CSRF nonce matches the one stored in the cookie
        if (!storedNonce || !stateObj.nonce || storedNonce !== stateObj.nonce) {
          const loginUrl = new URL("/login", req.url);
          loginUrl.searchParams.set("error", "google_csrf_failed");
          return NextResponse.redirect(loginUrl);
        }

        // Extract redirect target and validate it
        const redirect = stateObj.redirect || "/dashboard";
        if (
          typeof redirect === "string" &&
          redirect.startsWith("/") &&
          !redirect.startsWith("//") &&
          !redirect.includes("://") &&
          !redirect.includes("\\") &&
          !/^\/[^/]*@/.test(redirect)
        ) {
          redirectTo = redirect;
        }
      } catch {
        // Invalid state — use default redirect
      }
    }
    const redirectUrl = new URL(redirectTo, req.url);
    // Extra safety: ensure the redirect stays on the same origin
    const reqOrigin = new URL(req.url).origin;
    if (redirectUrl.origin !== reqOrigin) {
      redirectUrl.href = new URL("/dashboard", req.url).href;
    }
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

    // Clean up the OAuth nonce cookie
    response.cookies.delete("yoodle-oauth-nonce");

    return response;
  } catch (err) {
    console.error("[Google Callback Error]", err);

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(loginUrl);
  }
});

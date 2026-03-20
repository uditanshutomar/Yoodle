import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { exchangeCodeForTokens, getGoogleUserProfile } from "@/lib/infra/auth/google";
import { signAccessToken, signRefreshToken } from "@/lib/infra/auth/jwt";
import { createLogger } from "@/lib/infra/logger";

const oauthStateSchema = z.object({
  nonce: z.string().optional(),
  redirect: z.string().optional(),
}).strict();

const log = createLogger("api:auth-google-callback");

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
    // ── Verify CSRF nonce BEFORE consuming the auth code ──────────────
    // The auth code is single-use; if we exchange it first and then fail
    // the CSRF check, the user has to re-authorize.
    let redirectTo = "/dashboard";

    // CSRF nonce is mandatory — reject if state is missing or unparsable
    if (!state) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("error", "google_csrf_failed");
      return NextResponse.redirect(loginUrl);
    }

    let stateObj: z.infer<typeof oauthStateSchema>;
    try {
      stateObj = oauthStateSchema.parse(JSON.parse(decodeURIComponent(state)));
    } catch {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("error", "google_csrf_failed");
      return NextResponse.redirect(loginUrl);
    }

    const storedNonce = req.cookies.get("yoodle-oauth-nonce")?.value;
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
      // Respect the user's saved mode when setting login status:
      //   lockin  → "dnd"     (do not disturb)
      //   invisible → "offline" (appear offline to others)
      //   social  → "online"  (visible)
      const loginStatus =
        user.mode === "lockin" ? "dnd" : user.mode === "invisible" ? "offline" : "online";

      const updateData: Record<string, unknown> = {
        googleId: profile.googleId,
        googleTokens: googleTokensData,
        status: loginStatus,
        lastSeenAt: new Date(),
      };

      // Update avatar if user doesn't have one
      if (!user.avatarUrl && profile.avatarUrl) {
        updateData.avatarUrl = profile.avatarUrl;
      }

      await User.findByIdAndUpdate(user._id, { $set: updateData });
    } else {
      // Create a new user from Google profile.
      // Wrap in try/catch for E11000 duplicate key errors — two concurrent
      // OAuth callbacks for the same new user can race past the findOne check.
      const baseDisplayName = profile.email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toLowerCase()
        .slice(0, 50);

      try {
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
      } catch (createErr) {
        // Handle E11000 duplicate key race — the other concurrent request created the user first
        if (createErr instanceof Error && "code" in createErr && (createErr as { code: number }).code === 11000) {
          user = await User.findOne({
            $or: [
              { googleId: profile.googleId },
              { email: profile.email.toLowerCase() },
            ],
          });
          if (!user) throw createErr; // Shouldn't happen — rethrow if it does
          // Update the race-winner's tokens with our fresh tokens
          await User.findByIdAndUpdate(user._id, { $set: { googleTokens: googleTokensData, lastSeenAt: new Date() } });
        } else {
          throw createErr;
        }
      }
    }

    const userId = user._id.toString();

    // Generate JWT session tokens
    const accessToken = await signAccessToken(userId);
    const refreshToken = await signRefreshToken(userId);

    // Store hashed refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash });

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
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Clean up the OAuth nonce cookie
    response.cookies.delete("yoodle-oauth-nonce");

    return response;
  } catch (err) {
    log.error({ err }, "Google OAuth callback failed");

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(loginUrl);
  }
});

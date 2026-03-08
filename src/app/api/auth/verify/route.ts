import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLink } from "@/lib/auth/magic-link";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const email = searchParams.get("email");

    if (!token || !email) {
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set("error", "invalid_link");
      return NextResponse.redirect(errorUrl);
    }

    await connectDB();

    // Verify the magic link
    const user = await verifyMagicLink(token, email);

    const userId = user._id.toString();

    // Generate tokens
    const accessToken = await signAccessToken(userId);
    const refreshToken = await signRefreshToken(userId);

    // Store the hashed refresh token in the user document
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await User.findByIdAndUpdate(user._id, {
      refreshTokenHash,
      status: "online",
    });

    // Redirect to dashboard with cookies set
    const dashboardUrl = new URL("/dashboard", request.url);
    const response = NextResponse.redirect(dashboardUrl);

    // Set access token cookie (httpOnly for security)
    response.cookies.set("yoodle-access-token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60, // 15 minutes
    });

    // Set refresh token cookie (httpOnly, not accessible by JS)
    response.cookies.set("yoodle-refresh-token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("[Verify Error]", error);

    const errorUrl = new URL("/login", request.url);
    if (error instanceof Error) {
      if (error.message.includes("expired")) {
        errorUrl.searchParams.set("error", "link_expired");
      } else {
        errorUrl.searchParams.set("error", "invalid_link");
      }
    } else {
      errorUrl.searchParams.set("error", "verification_failed");
    }

    return NextResponse.redirect(errorUrl);
  }
}

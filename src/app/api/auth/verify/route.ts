import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { verifyMagicLink } from "@/lib/infra/auth/magic-link";
import { signAccessToken, signRefreshToken } from "@/lib/infra/auth/jwt";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

const querySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
});

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    token: searchParams.get("token"),
    email: searchParams.get("email"),
  });

  if (!parsed.success) {
    const errorUrl = new URL("/login", req.url);
    errorUrl.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(errorUrl);
  }

  const { token, email } = parsed.data;

  try {
    await connectDB();

    // Verify the magic link
    const user = await verifyMagicLink(token, email);

    const userId = user._id.toString();

    // Generate tokens
    const accessToken = await signAccessToken(userId);
    const refreshToken = await signRefreshToken(userId);

    // Determine status based on user mode (consistent with Google callback)
    let loginStatus = "online";
    if (user.mode === "lockin") loginStatus = "dnd";
    else if (user.mode === "invisible") loginStatus = "offline";

    // Store the hashed refresh token in the user document
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await User.findByIdAndUpdate(user._id, {
      refreshTokenHash,
      status: loginStatus,
    });

    // Redirect to dashboard with cookies set
    const dashboardUrl = new URL("/dashboard", req.url);
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
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    const errorUrl = new URL("/login", req.url);
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
});

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getGoogleAuthUrl } from "@/lib/infra/auth/google";

const querySchema = z.object({
  redirect: z.string().optional().default("/dashboard"),
});

/**
 * GET /api/auth/google
 * Returns the Google OAuth consent URL for the client to redirect to.
 * Includes a CSRF nonce in the OAuth state to prevent login CSRF attacks.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  const { redirect } = querySchema.parse({
    redirect: req.nextUrl.searchParams.get("redirect") ?? undefined,
  });

  // Generate CSRF nonce to bind the OAuth flow to this session
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = JSON.stringify({ nonce, redirect });

  const authUrl = getGoogleAuthUrl(state);

  // Set nonce in a short-lived httpOnly cookie for verification in the callback
  const response = NextResponse.json({ success: true, data: { url: authUrl } });
  response.cookies.set("yoodle-oauth-nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes — enough for OAuth flow
  });

  return response;
});

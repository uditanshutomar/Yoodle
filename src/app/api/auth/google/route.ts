import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getGoogleAuthUrl } from "@/lib/auth/google";

const querySchema = z.object({
  redirect: z.string().optional().default("/dashboard"),
});

/**
 * GET /api/auth/google
 * Returns the Google OAuth consent URL for the client to redirect to.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  const { redirect } = querySchema.parse({
    redirect: req.nextUrl.searchParams.get("redirect") ?? undefined,
  });

  const authUrl = getGoogleAuthUrl(redirect);
  return successResponse({ url: authUrl });
});

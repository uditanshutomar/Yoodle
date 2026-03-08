import { NextRequest } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/google";
import { successResponse, serverErrorResponse } from "@/lib/utils/api-response";

/**
 * GET /api/auth/google
 * Returns the Google OAuth consent URL for the client to redirect to.
 */
export async function GET(request: NextRequest) {
  try {
    const redirect = request.nextUrl.searchParams.get("redirect") || "/dashboard";
    const authUrl = getGoogleAuthUrl(redirect);
    return successResponse({ url: authUrl });
  } catch (error) {
    console.error("[Google Auth Error]", error);
    return serverErrorResponse("Failed to generate Google auth URL.");
  }
}

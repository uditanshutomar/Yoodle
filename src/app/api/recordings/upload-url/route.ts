import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";

/**
 * POST /api/recordings/upload-url
 *
 * DEPRECATED — Recordings now upload directly to Google Drive via
 * POST /api/recordings/upload (multipart form data).
 *
 * This endpoint is kept for backwards compatibility and returns an
 * instruction to use the new upload endpoint instead.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  await getUserIdFromRequest(req);

  return successResponse({
    deprecated: true,
    message:
      "Pre-signed S3 URLs are no longer used. Please use POST /api/recordings/upload with multipart form data to upload recordings to Google Drive.",
  });
});

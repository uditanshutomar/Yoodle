import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";

// ── GET /api/meetings/:meetingId/analytics ──────────────────────────

/**
 * Return analytics for a specific meeting.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  await getUserIdFromRequest(req); // auth gate
  const { meetingId } = await context!.params;

  await connectDB();

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
  const analytics = await MeetingAnalytics.findOne({ meetingId }).lean();

  if (!analytics) {
    return errorResponse("NOT_FOUND", "No analytics available", 404);
  }

  return successResponse(analytics);
});

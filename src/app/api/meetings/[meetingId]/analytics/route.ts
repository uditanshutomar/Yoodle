import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import { buildMeetingFilter } from "@/lib/meetings/helpers";

// ── GET /api/meetings/:meetingId/analytics ──────────────────────────

/**
 * Return analytics for a specific meeting.
 * Only participants and the host can view analytics.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  await connectDB();

  // Verify the user is a participant or host of the meeting
  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
  const filter = buildMeetingFilter(meetingId);
  const meeting = await Meeting.findOne({
    ...filter,
    $or: [
      { hostId: userId },
      { "participants.userId": userId },
    ],
  }).select("_id").lean();

  if (!meeting) {
    return errorResponse("FORBIDDEN", "Not a participant in this meeting", 403);
  }

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
  const analytics = await MeetingAnalytics.findOne({ meetingId }).lean();

  if (!analytics) {
    return errorResponse("NOT_FOUND", "No analytics available", 404);
  }

  return successResponse(analytics);
});

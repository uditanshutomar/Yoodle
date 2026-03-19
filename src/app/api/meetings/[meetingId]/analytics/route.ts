import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
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
  const userOid = new mongoose.Types.ObjectId(userId);
  const meeting = await Meeting.findOne({
    ...filter,
    $or: [
      { hostId: userOid },
      { "participants.userId": userOid },
    ],
  }).select("_id").lean();

  if (!meeting) {
    throw new ForbiddenError("Not a participant in this meeting.");
  }

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
  const analytics = await MeetingAnalytics.findOne({ meetingId: meeting._id }).lean();

  if (!analytics) {
    throw new NotFoundError("No analytics available for this meeting.");
  }

  return successResponse(analytics);
});

import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import { buildMeetingFilter } from "@/lib/meetings/helpers";

// ── GET /api/meetings/:meetingId/brief ──────────────────────────────

/**
 * Return the existing meeting brief for the authenticated user.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  await connectDB();

  const MeetingBrief = (await import("@/lib/infra/db/models/meeting-brief")).default;
  const brief = await MeetingBrief.findOne({ meetingId, userId }).lean();

  if (!brief) {
    throw new NotFoundError("No brief found for this meeting.");
  }

  return successResponse(brief);
});

// ── POST /api/meetings/:meetingId/brief ─────────────────────────────

/**
 * Generate a new meeting brief by invoking the prepare_meeting_brief tool.
 * Only meeting participants or the host can generate a brief.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
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
    throw new ForbiddenError("Not a participant in this meeting.");
  }

  const { executeWorkspaceTool } = await import("@/lib/ai/tools");
  const result = await executeWorkspaceTool(userId, "prepare_meeting_brief", {
    meetingId,
    createDoc: true,
  });

  if (!result.success) {
    throw new BadRequestError(result.summary || "Brief generation failed.");
  }

  return successResponse(result.data);
});

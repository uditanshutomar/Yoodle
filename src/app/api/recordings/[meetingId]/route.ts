import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { hasGoogleAccess } from "@/lib/google/client";
import { listMeetingRecordings } from "@/lib/google/drive-recordings";

/**
 * GET /api/recordings/[meetingId]
 *
 * Lists recordings for a meeting from the host's Google Drive.
 * Returns file metadata and Google Drive view/download links.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  if (!meetingId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new NotFoundError("Meeting not found.");
  }

  // Verify the user is a participant or host of this meeting
  await connectDB();
  const meeting = await Meeting.findById(meetingId).select("hostId participants").lean();
  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }
  const hostIdStr = meeting.hostId.toString();
  const isParticipant =
    hostIdStr === userId ||
    meeting.participants.some((p: { userId: { toString: () => string } }) => p.userId.toString() === userId);
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // Check if the requesting user has Google Drive access
  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    // Also try with the host's account — recordings are stored in host's Drive
    const hostHasAccess = await hasGoogleAccess(hostIdStr);
    if (!hostHasAccess) {
      return successResponse({ recordings: [], meetingId });
    }

    // Fetch from host's Drive
    const recordings = await listMeetingRecordings(
      hostIdStr,
      meetingId
    );

    return successResponse({
      recordings: recordings.map((r) => ({
        fileId: r.fileId,
        name: r.name,
        mimeType: r.mimeType,
        size: r.size,
        createdTime: r.createdTime,
        viewUrl: r.webViewLink,
        downloadUrl: r.webContentLink,
      })),
      meetingId,
    });
  }

  // Fetch from the requesting user's Drive
  const recordings = await listMeetingRecordings(userId, meetingId);

  return successResponse({
    recordings: recordings.map((r) => ({
      fileId: r.fileId,
      name: r.name,
      mimeType: r.mimeType,
      size: r.size,
      createdTime: r.createdTime,
      viewUrl: r.webViewLink,
      downloadUrl: r.webContentLink,
    })),
    meetingId,
  });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { ForbiddenError, NotFoundError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";

// ── Validation schema ─────────────────────────────────────────────

const startRecordingSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required."),
  roomName: z.string().min(1, "Room name is required."),
});

// ── POST /api/recordings/start ────────────────────────────────────

/**
 * Start a recording for a meeting room.
 *
 * With Google Drive storage, recordings are captured client-side via
 * MediaRecorder and uploaded directly to Google Drive through the
 * POST /api/recordings/upload endpoint.
 *
 * This endpoint validates the request and authorises the recording.
 * The actual capture happens in the browser. Only the meeting host
 * may start a recording.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const body = startRecordingSchema.parse(await req.json());
  const { meetingId } = body;

  // Verify meeting exists and user is the host
  await connectDB();
  const meeting = await Meeting.findById(meetingId);

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  if (meeting.hostId.toString() !== userId) {
    throw new ForbiddenError("Only the meeting host can start a recording.");
  }

  // Recording is handled client-side with Google Drive upload.
  // Return success to signal the host is authorized to record.
  return successResponse({
    authorized: true,
    meetingId,
    message: "Recording authorized. Client-side capture will upload to Google Drive.",
  });
});

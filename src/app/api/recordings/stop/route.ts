import { NextRequest } from "next/server";
import { z } from "zod";
import { EgressClient } from "livekit-server-sdk";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  isLiveKitConfigured,
} from "@/lib/livekit/config";

// ── Validation schema ─────────────────────────────────────────────

const stopRecordingSchema = z.object({
  egressId: z.string().min(1, "Egress ID is required."),
  meetingId: z.string().min(1, "Meeting ID is required."),
});

// ── POST /api/recordings/stop ─────────────────────────────────────

/**
 * Stop an active server-side recording by egress ID.
 *
 * Calls the LiveKit Egress API to gracefully stop the recording.
 * The finalized file will be available in the configured S3 bucket.
 * Only the meeting host can stop a recording.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  if (!isLiveKitConfigured()) {
    throw new BadRequestError(
      "LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  const body = stopRecordingSchema.parse(await req.json());
  const { egressId, meetingId } = body;

  // Verify the caller is the host of this meeting
  await connectDB();
  const meeting = await Meeting.findById(meetingId).select("hostId").lean();
  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }
  if (meeting.hostId.toString() !== userId) {
    throw new ForbiddenError("Only the meeting host can stop a recording.");
  }

  const egressClient = new EgressClient(
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
  );

  await egressClient.stopEgress(egressId);

  return successResponse({ stopped: true });
});

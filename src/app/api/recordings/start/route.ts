import { NextRequest } from "next/server";
import { z } from "zod";
import { EgressClient, EncodedFileOutput, S3Upload } from "livekit-server-sdk";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/api/errors";
import {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  isLiveKitConfigured,
} from "@/lib/livekit/config";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";

// ── Validation schema ─────────────────────────────────────────────

const startRecordingSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required."),
  roomName: z.string().min(1, "Room name is required."),
});

// ── POST /api/recordings/start ────────────────────────────────────

/**
 * Start a server-side recording for a LiveKit room using the Egress API.
 *
 * Initiates a RoomCompositeEgress that records the full room composition
 * and uploads the resulting file to S3-compatible object storage.
 * Only the meeting host may start a recording.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  if (!isLiveKitConfigured()) {
    throw new BadRequestError(
      "LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  const body = startRecordingSchema.parse(await req.json());
  const { meetingId, roomName } = body;

  // Verify meeting exists and user is the host
  await connectDB();
  const meeting = await Meeting.findById(meetingId);

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  if (meeting.hostId.toString() !== userId) {
    throw new ForbiddenError("Only the meeting host can start a recording.");
  }

  // Build S3-compatible upload target from env vars
  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3AccessKey = process.env.S3_ACCESS_KEY;
  const s3SecretKey = process.env.S3_SECRET_KEY;
  const s3Bucket = process.env.S3_BUCKET;

  if (!s3Endpoint || !s3AccessKey || !s3SecretKey || !s3Bucket) {
    throw new BadRequestError(
      "S3 storage is not configured. Please set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET.",
    );
  }

  const s3Upload = new S3Upload({
    endpoint: s3Endpoint,
    accessKey: s3AccessKey,
    secret: s3SecretKey,
    bucket: s3Bucket,
    forcePathStyle: true,
  });

  const fileOutput = new EncodedFileOutput({
    filepath: `recordings/${meetingId}/{room_name}-{time}`,
    output: { case: "s3", value: s3Upload },
  });

  const egressClient = new EgressClient(
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
  );

  const egressInfo = await egressClient.startRoomCompositeEgress(
    roomName,
    fileOutput,
  );

  return successResponse({ egressId: egressInfo.egressId });
});

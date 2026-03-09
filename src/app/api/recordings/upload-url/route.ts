import { NextRequest } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Transcript from "@/lib/db/models/transcript";
import Meeting from "@/lib/db/models/meeting";
import { getPresignedUploadUrl } from "@/lib/vultr/object-storage";

const speechSegmentSchema = z.object({
  speakerId: z.string(),
  speakerName: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

const uploadRequestSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required."),
  contentType: z
    .string()
    .regex(/^(audio|video)\//, "Must be an audio or video content type."),
  /** Speech segments from voice activity detection for speaker attribution */
  speechSegments: z.array(speechSegmentSchema).optional(),
});

/**
 * POST /api/recordings/upload-url
 *
 * Generates a pre-signed URL for the client to upload a recording
 * directly to Vultr Object Storage. Returns the upload URL and the
 * storage key so the client can PUT the file and then confirm it.
 *
 * Optionally accepts speechSegments from voice activity detection,
 * which are stored in the Transcript model for speaker attribution
 * when the audio is later transcribed to text.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = uploadRequestSchema.parse(await req.json());
  const { meetingId, contentType, speechSegments } = body;

  // Verify user is a participant in this meeting
  await connectDB();
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }
  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some((p) => p.userId.toString() === userId);
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // Determine file extension from content type
  const ext = contentType.includes("webm")
    ? "webm"
    : contentType.includes("mp4")
      ? "mp4"
      : contentType.includes("ogg")
        ? "ogg"
        : "webm";

  const key = `recordings/${meetingId}/${nanoid()}.${ext}`;

  const uploadUrl = await getPresignedUploadUrl(key, contentType, 600); // 10 min expiry

  // Store speech segments for speaker-attributed transcription
  if (speechSegments && speechSegments.length > 0) {
    await Transcript.findOneAndUpdate(
      { meetingId },
      {
        $push: {
          segments: {
            $each: speechSegments.map((seg) => ({
              speaker: seg.speakerName,
              speakerId: seg.speakerId,
              text: "", // Will be filled when audio is transcribed
              timestamp: seg.startTime,
              duration: seg.endTime - seg.startTime,
            })),
          },
        },
      },
      { upsert: true, new: true }
    );
  }

  return successResponse({ uploadUrl, key });
});

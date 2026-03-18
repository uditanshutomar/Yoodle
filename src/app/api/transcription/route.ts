import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Transcript from "@/lib/infra/db/models/transcript";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user";
import mongoose from "mongoose";
import { getSTTProvider } from "@/lib/stt";

async function verifyMeetingParticipant(userId: string, meetingId: string): Promise<boolean> {
  const meeting = await Meeting.findById(meetingId).select("hostId participants status").lean();
  if (!meeting) return false;
  // Only allow active meetings
  if (!["scheduled", "live"].includes(meeting.status)) return false;
  return (
    meeting.hostId.toString() === userId ||
    meeting.participants.some((p: { userId: { toString: () => string }; status?: string }) =>
      p.userId.toString() === userId && (!p.status || p.status === "joined")
    )
  );
}

// ── Validation schemas ──────────────────────────────────────────────

const transcriptionQuerySchema = z.object({
  meetingId: z.string().min(1, "meetingId query parameter is required."),
});

// ── POST /api/transcription ─────────────────────────────────────────

/**
 * Accepts an audio chunk and transcribes it using the configured STT provider
 * using Deepgram nova-2.
 * Stores the transcribed text in the Transcript model for the meeting.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  const meetingId = formData.get("meetingId") as string | null;
  const timestamp = formData.get("timestamp") as string | null;

  if (!audioFile || !meetingId) {
    throw new BadRequestError("Missing required fields: audio, meetingId");
  }

  // Validate meetingId before using as ObjectId
  if (!mongoose.Types.ObjectId.isValid(meetingId)) {
    throw new BadRequestError("Invalid meeting ID.");
  }

  // Validate audio file size (max 25 MB for a single chunk)
  const MAX_AUDIO_CHUNK_SIZE = 25 * 1024 * 1024;
  if (audioFile.size > MAX_AUDIO_CHUNK_SIZE) {
    throw new BadRequestError(`Audio chunk too large. Maximum size is ${MAX_AUDIO_CHUNK_SIZE / (1024 * 1024)} MB.`);
  }

  await connectDB();
  if (!(await verifyMeetingParticipant(userId, meetingId))) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // Resolve speaker identity server-side — never trust client-supplied speakerId/speakerName
  const callerUser = await User.findById(userId).select("name displayName").lean();
  const resolvedSpeakerName = callerUser?.displayName || callerUser?.name || "Unknown";

  // Get the configured STT provider and transcribe
  const provider = await getSTTProvider();
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  const result = await provider.transcribe(audioBuffer);
  const text = result.text?.trim() || "";

  if (!text) {
    return successResponse({ text: "", stored: false });
  }

  // Store in MongoDB — use authenticated userId as speakerId
  await Transcript.findOneAndUpdate(
    { meetingId: new mongoose.Types.ObjectId(meetingId) },
    {
      $push: {
        segments: {
          $each: [
            {
              speaker: resolvedSpeakerName,
              speakerId: userId,
              text,
              timestamp: timestamp && !isNaN(Number(timestamp)) ? parseInt(timestamp, 10) : Date.now(),
            },
          ],
          $slice: -2000,
        },
      },
    },
    { upsert: true, new: true }
  );

  return successResponse({ text, stored: true });
});

// ── GET /api/transcription?meetingId=xxx ─────────────────────────────

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = transcriptionQuerySchema.parse({
    meetingId: req.nextUrl.searchParams.get("meetingId"),
  });

  // Validate meetingId before using as ObjectId
  if (!mongoose.Types.ObjectId.isValid(meetingId)) {
    throw new BadRequestError("Invalid meeting ID.");
  }

  await connectDB();

  if (!(await verifyMeetingParticipant(userId, meetingId))) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  const transcript = await Transcript.findOne({
    meetingId: new mongoose.Types.ObjectId(meetingId),
  })
    .select("segments language")
    .lean();

  if (!transcript) {
    return successResponse({ segments: [], meetingId });
  }

  return successResponse({
    meetingId,
    segments: transcript.segments,
    language: transcript.language,
  });
});

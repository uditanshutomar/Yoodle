import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Transcript from "@/lib/infra/db/models/transcript";
import Meeting from "@/lib/infra/db/models/meeting";
import mongoose from "mongoose";
import { getSTTProvider } from "@/lib/stt";

async function verifyMeetingParticipant(userId: string, meetingId: string): Promise<boolean> {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) return false;
  return (
    meeting.hostId.toString() === userId ||
    meeting.participants.some((p: { userId: { toString: () => string } }) => p.userId.toString() === userId)
  );
}

// ── Validation schemas ──────────────────────────────────────────────

const transcriptionQuerySchema = z.object({
  meetingId: z.string().min(1, "meetingId query parameter is required."),
});

// ── POST /api/transcription ─────────────────────────────────────────

/**
 * Accepts an audio chunk and transcribes it using the configured STT provider
 * (ElevenLabs, Deepgram, or OpenAI Whisper — set via STT_PROVIDER env var).
 * Stores the transcribed text in the Transcript model for the meeting.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  const meetingId = formData.get("meetingId") as string | null;
  const speakerName = formData.get("speakerName") as string | null;
  const speakerId = formData.get("speakerId") as string | null;
  const timestamp = formData.get("timestamp") as string | null;

  if (!audioFile || !meetingId || !speakerName || !speakerId) {
    throw new BadRequestError("Missing required fields: audio, meetingId, speakerName, speakerId");
  }

  await connectDB();
  if (!(await verifyMeetingParticipant(userId, meetingId))) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // Get the configured STT provider and transcribe
  const provider = await getSTTProvider();
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  const result = await provider.transcribe(audioBuffer);
  const text = result.text?.trim() || "";

  if (!text) {
    return successResponse({ text: "", stored: false });
  }

  // Store in MongoDB
  await Transcript.findOneAndUpdate(
    { meetingId: new mongoose.Types.ObjectId(meetingId) },
    {
      $push: {
        segments: {
          speaker: speakerName,
          speakerId,
          text,
          timestamp: timestamp ? parseInt(timestamp, 10) : Date.now(),
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

  await connectDB();

  if (!(await verifyMeetingParticipant(userId, meetingId))) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  const transcript = await Transcript.findOne({
    meetingId: new mongoose.Types.ObjectId(meetingId),
  });

  if (!transcript) {
    return successResponse({ segments: [], meetingId });
  }

  return successResponse({
    meetingId,
    segments: transcript.segments,
    language: transcript.language,
  });
});

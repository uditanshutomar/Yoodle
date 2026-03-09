import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Transcript from "@/lib/db/models/transcript";
import Meeting from "@/lib/db/models/meeting";
import mongoose from "mongoose";

async function verifyMeetingParticipant(userId: string, meetingId: string): Promise<boolean> {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) return false;
  return (
    meeting.hostId.toString() === userId ||
    meeting.participants.some((p) => p.userId.toString() === userId)
  );
}

// ── Validation schemas ──────────────────────────────────────────────

const transcriptionQuerySchema = z.object({
  meetingId: z.string().min(1, "meetingId query parameter is required."),
});

// ── POST /api/transcription ─────────────────────────────────────────

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

  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    throw new Error("Transcription service not configured.");
  }

  // Send audio to ElevenLabs STT
  const elevenLabsForm = new FormData();
  elevenLabsForm.append("file", audioFile, "chunk.webm");
  elevenLabsForm.append("model_id", "scribe_v1");

  const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: elevenLabsForm,
  });

  if (!sttRes.ok) {
    const errText = await sttRes.text();
    console.error("[Transcription] ElevenLabs STT error:", sttRes.status, errText);
    throw new BadRequestError("Transcription service error.");
  }

  const sttData = await sttRes.json();
  const text = sttData.text?.trim() || "";

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

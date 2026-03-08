import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Transcript from "@/lib/db/models/transcript";
import Meeting from "@/lib/db/models/meeting";
import mongoose from "mongoose";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

async function verifyMeetingParticipant(userId: string, meetingId: string): Promise<boolean> {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) return false;
  return (
    meeting.hostId.toString() === userId ||
    meeting.participants.some((p) => p.userId.toString() === userId)
  );
}

// ── POST /api/transcription ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const meetingId = formData.get("meetingId") as string | null;
    const speakerName = formData.get("speakerName") as string | null;
    const speakerId = formData.get("speakerId") as string | null;
    const timestamp = formData.get("timestamp") as string | null;

    if (!audioFile || !meetingId || !speakerName || !speakerId) {
      return errorResponse("Missing required fields: audio, meetingId, speakerName, speakerId", 400);
    }

    await connectDB();
    if (!(await verifyMeetingParticipant(userId, meetingId))) {
      return errorResponse("You are not a participant in this meeting.", 403);
    }

    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      return serverErrorResponse("Transcription service not configured.");
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
      return errorResponse("Transcription service error.", sttRes.status >= 500 ? 502 : 400);
    }

    const sttData = await sttRes.json();
    const text = sttData.text?.trim() || "";

    if (!text) {
      return successResponse({ text: "", stored: false });
    }

    // Store in MongoDB
    await connectDB();

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
  } catch (error) {
    console.error("[Transcription Error]", error);
    return serverErrorResponse("Failed to transcribe audio.");
  }
}

// ── GET /api/transcription?meetingId=xxx ─────────────────────────────

export async function GET(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get("meetingId");

    if (!meetingId) {
      return errorResponse("meetingId query parameter is required.", 400);
    }

    await connectDB();

    if (!(await verifyMeetingParticipant(userId, meetingId))) {
      return errorResponse("You are not a participant in this meeting.", 403);
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
  } catch (error) {
    console.error("[Transcription GET Error]", error);
    return serverErrorResponse("Failed to retrieve transcript.");
  }
}

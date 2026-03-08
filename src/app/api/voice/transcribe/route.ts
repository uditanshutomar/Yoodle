import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import { transcribeAudio } from "@/lib/voice/eleven-labs";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// POST /api/voice/transcribe — transcribe audio using 11 Labs
export async function POST(request: NextRequest) {
  try {
    try {
      await authenticateRequest(request);
    } catch {
      return unauthorizedResponse();
    }

    const contentType = request.headers.get("content-type") || "";

    let audioBuffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("audio") as File | null;

      if (!file) {
        return errorResponse("No audio file provided. Send as 'audio' in form data.", 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      // Raw binary body
      const arrayBuffer = await request.arrayBuffer();

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return errorResponse("Empty audio data.", 400);
      }

      audioBuffer = Buffer.from(arrayBuffer);
    }

    const result = await transcribeAudio(audioBuffer);

    return successResponse({
      text: result.text,
      segments: result.segments,
      wordCount: result.text.split(/\s+/).filter(Boolean).length,
    });
  } catch (error) {
    console.error("[Transcribe Error]", error);
    return serverErrorResponse("Transcription failed.");
  }
}

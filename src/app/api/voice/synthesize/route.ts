import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import { synthesizeSpeech } from "@/lib/voice/eleven-labs";
import { unauthorizedResponse } from "@/lib/utils/api-response";

// POST /api/voice/synthesize — text-to-speech using 11 Labs
export async function POST(request: NextRequest) {
  try {
    try {
      await authenticateRequest(request);
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { text, voiceId } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Text is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (text.length > 5000) {
      return new Response(JSON.stringify({ success: false, error: "Text too long. Max 5000 characters." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const audioBuffer = await synthesizeSpeech(text.trim(), voiceId);

    return new Response(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[Synthesize Error]", error);
    return new Response(JSON.stringify({ success: false, error: "Speech synthesis failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

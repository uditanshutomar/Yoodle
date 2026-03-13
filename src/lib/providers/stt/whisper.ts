import type { STTProvider, TranscriptResult, TranscriptSegment } from "./types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

function getApiKey(): string {
  const apiKey = process.env.STT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI Whisper STT not configured. Set STT_API_KEY or OPENAI_API_KEY."
    );
  }
  return apiKey;
}

function toBuffer(audio: Buffer | ArrayBuffer): Buffer {
  if (audio instanceof ArrayBuffer) {
    return Buffer.from(audio);
  }
  return audio;
}

interface WhisperSegment {
  id: number;
  text: string;
  start: number;
  end: number;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: WhisperSegment[];
}

/**
 * OpenAI Whisper STT provider.
 * Uses the whisper-1 model for audio transcription.
 * Returns verbose JSON with segment-level timestamps.
 */
export class WhisperSTTProvider implements STTProvider {
  readonly name = "whisper";

  async transcribe(
    audio: Buffer | ArrayBuffer,
    options?: { language?: string },
  ): Promise<TranscriptResult> {
    const buffer = toBuffer(audio);
    const apiKey = getApiKey();

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: "audio/webm" });
    formData.append("file", blob, "recording.webm");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    if (options?.language) {
      formData.append("language", options.language);
    }

    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI Whisper STT failed (${response.status}): ${errorBody}`
      );
    }

    const data: WhisperVerboseResponse = await response.json();

    const segments: TranscriptSegment[] = (data.segments || []).map((seg) => ({
      text: seg.text.trim(),
      start: seg.start,
      end: seg.end,
    }));

    return {
      text: data.text || "",
      segments,
    };
  }
}

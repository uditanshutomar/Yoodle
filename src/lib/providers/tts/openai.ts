import type { TTSProvider, VoiceInfo } from "../types";

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

function getApiKey(): string {
  const apiKey = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI TTS not configured. Set TTS_API_KEY or OPENAI_API_KEY.",
    );
  }
  return apiKey;
}

/**
 * OpenAI TTS provider.
 * Uses the tts-1 model for fast synthesis or tts-1-hd for high quality.
 * Available voices: alloy, echo, fable, onyx, nova, shimmer.
 */
export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";

  async synthesize(
    text: string,
    voice?: string,
  ): Promise<Buffer> {
    if (!text.trim()) {
      return Buffer.alloc(0);
    }

    const apiKey = getApiKey();

    const response = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice || "nova",
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI TTS failed (${response.status}): ${errorBody}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getVoices(): Promise<VoiceInfo[]> {
    return [
      { voiceId: "alloy", name: "Alloy", category: "standard" },
      { voiceId: "echo", name: "Echo", category: "standard" },
      { voiceId: "fable", name: "Fable", category: "standard" },
      { voiceId: "onyx", name: "Onyx", category: "standard" },
      { voiceId: "nova", name: "Nova", category: "standard" },
      { voiceId: "shimmer", name: "Shimmer", category: "standard" },
    ];
  }
}

import type { TTSProvider, VoiceInfo } from "../types";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel
const TTS_MODEL = "eleven_multilingual_v2";

function getApiKey(): string {
  const apiKey = process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error("TTS_API_KEY not configured for ElevenLabs TTS provider");
  }
  return apiKey;
}

function getJsonHeaders(): Record<string, string> {
  return {
    "xi-api-key": getApiKey(),
    "Content-Type": "application/json",
  };
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
}

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";

  async synthesize(text: string, voice?: string): Promise<Buffer> {
    const voiceId = voice || DEFAULT_VOICE_ID;

    const response = await fetch(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `ElevenLabs TTS failed (${response.status}): ${errorBody}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getVoices(): Promise<VoiceInfo[]> {
    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      method: "GET",
      headers: getJsonHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `ElevenLabs voices listing failed (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json();
    const voices: ElevenLabsVoice[] = data.voices || [];

    return voices.map((voice) => ({
      voiceId: voice.voice_id,
      name: voice.name,
      category: voice.category,
    }));
  }
}

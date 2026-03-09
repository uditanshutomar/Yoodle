import type { TTSProvider, VoiceInfo } from "../types";

// TODO: Implement OpenAI TTS provider
// - API docs: https://platform.openai.com/docs/guides/text-to-speech
// - Uses OPENAI_API_KEY env var
// - POST to https://api.openai.com/v1/audio/speech
// - Model: tts-1 (fast) or tts-1-hd (high quality)
// - Voices: alloy, echo, fable, onyx, nova, shimmer

export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";

  async synthesize(
    _text: string,
    _voice?: string,
  ): Promise<Buffer> {
    throw new Error(
      "Not implemented yet — configure TTS_PROVIDER=elevenlabs",
    );
  }

  async getVoices(): Promise<VoiceInfo[]> {
    // OpenAI has a fixed set of voices
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

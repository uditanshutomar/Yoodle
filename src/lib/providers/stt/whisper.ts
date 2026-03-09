import type { STTProvider, TranscriptResult } from "../types";

// TODO: Implement OpenAI Whisper STT provider
// - API docs: https://platform.openai.com/docs/guides/speech-to-text
// - Uses OPENAI_API_KEY env var
// - POST to https://api.openai.com/v1/audio/transcriptions
// - Model: whisper-1
// - Supports language hint and response format options

export class WhisperSTTProvider implements STTProvider {
  readonly name = "whisper";

  async transcribe(
    _audio: Buffer | ArrayBuffer,
    _options?: { language?: string },
  ): Promise<TranscriptResult> {
    throw new Error(
      "Not implemented yet — configure STT_PROVIDER=elevenlabs",
    );
  }
}

import type { STTProvider, TranscriptResult } from "../types";

// TODO: Implement Deepgram STT provider
// - API docs: https://developers.deepgram.com/docs
// - Uses DEEPGRAM_API_KEY env var
// - Supports real-time streaming transcription
// - Nova-2 model recommended for best accuracy

export class DeepgramSTTProvider implements STTProvider {
  readonly name = "deepgram";

  async transcribe(
    _audio: Buffer | ArrayBuffer,
    _options?: { language?: string },
  ): Promise<TranscriptResult> {
    throw new Error(
      "Not implemented yet — configure STT_PROVIDER=elevenlabs",
    );
  }
}

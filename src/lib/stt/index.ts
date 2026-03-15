import { DeepgramSTTProvider } from "./deepgram";

let cached: DeepgramSTTProvider | null = null;

/**
 * Get the Deepgram STT provider (singleton).
 * Used for batch meeting transcription.
 */
export function getSTTProvider(): DeepgramSTTProvider {
  if (!cached) cached = new DeepgramSTTProvider();
  return cached;
}

export { DeepgramSTTProvider } from "./deepgram";
export type { STTProvider, TranscriptResult, TranscriptSegment } from "./types";

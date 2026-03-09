import type { STTProvider } from "../types";

let cachedProvider: STTProvider | null = null;

/**
 * Get the configured STT provider.
 * Selection via STT_PROVIDER env var: "elevenlabs" | "deepgram" | "whisper"
 * Defaults to "elevenlabs" if not specified.
 */
export async function getSTTProvider(): Promise<STTProvider> {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.STT_PROVIDER || "elevenlabs";

  switch (provider) {
    case "elevenlabs": {
      const { ElevenLabsSTTProvider } = await import("./elevenlabs");
      cachedProvider = new ElevenLabsSTTProvider();
      break;
    }
    case "deepgram": {
      const { DeepgramSTTProvider } = await import("./deepgram");
      cachedProvider = new DeepgramSTTProvider();
      break;
    }
    case "whisper": {
      const { WhisperSTTProvider } = await import("./whisper");
      cachedProvider = new WhisperSTTProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown STT_PROVIDER: "${provider}". Supported: elevenlabs, deepgram, whisper`,
      );
  }

  return cachedProvider;
}

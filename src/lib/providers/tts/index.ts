import type { TTSProvider } from "../types";

let cachedProvider: TTSProvider | null = null;

/**
 * Get the configured TTS provider.
 * Selection via TTS_PROVIDER env var: "elevenlabs" | "openai"
 * Defaults to "elevenlabs" if not specified.
 */
export async function getTTSProvider(): Promise<TTSProvider> {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.TTS_PROVIDER || "elevenlabs";

  switch (provider) {
    case "elevenlabs": {
      const { ElevenLabsTTSProvider } = await import("./elevenlabs");
      cachedProvider = new ElevenLabsTTSProvider();
      break;
    }
    case "openai": {
      const { OpenAITTSProvider } = await import("./openai");
      cachedProvider = new OpenAITTSProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown TTS_PROVIDER: "${provider}". Supported: elevenlabs, openai`,
      );
  }

  return cachedProvider;
}

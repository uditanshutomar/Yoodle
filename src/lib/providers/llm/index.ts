import type { LLMProvider } from "../types";

let cachedProvider: LLMProvider | null = null;

/**
 * Get the configured LLM provider.
 * Selection via LLM_PROVIDER env var: "claude" | "gemini" | "openai"
 * Defaults to "claude" if not specified.
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.LLM_PROVIDER || "claude";

  switch (provider) {
    case "claude": {
      const { ClaudeLLMProvider } = await import("./claude");
      cachedProvider = new ClaudeLLMProvider();
      break;
    }
    case "gemini": {
      const { GeminiLLMProvider } = await import("./gemini");
      cachedProvider = new GeminiLLMProvider();
      break;
    }
    case "openai": {
      const { OpenAILLMProvider } = await import("./openai");
      cachedProvider = new OpenAILLMProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}". Supported: claude, gemini, openai`,
      );
  }

  return cachedProvider;
}

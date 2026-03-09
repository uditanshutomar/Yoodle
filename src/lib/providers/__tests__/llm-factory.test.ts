import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock the dynamic imports before importing the factory
vi.mock("../llm/claude", () => ({
  ClaudeLLMProvider: vi.fn().mockImplementation(() => ({
    name: "claude",
    generateText: vi.fn(),
  })),
}));

vi.mock("../llm/gemini", () => ({
  GeminiLLMProvider: vi.fn().mockImplementation(() => ({
    name: "gemini",
    generateText: vi.fn(),
  })),
}));

vi.mock("../llm/openai", () => ({
  OpenAILLMProvider: vi.fn().mockImplementation(() => ({
    name: "openai",
    generateText: vi.fn(),
  })),
}));

describe("getLLMProvider", () => {
  beforeEach(() => {
    // Reset module cache so cachedProvider is cleared between tests
    vi.resetModules();
  });

  it("returns Claude provider when LLM_PROVIDER is 'claude'", async () => {
    process.env.LLM_PROVIDER = "claude";

    const { getLLMProvider } = await import("../llm/index");
    const provider = await getLLMProvider();

    expect(provider).toBeDefined();
    expect(provider.name).toBe("claude");
  });

  it("returns Gemini provider when LLM_PROVIDER is 'gemini'", async () => {
    process.env.LLM_PROVIDER = "gemini";

    const { getLLMProvider } = await import("../llm/index");
    const provider = await getLLMProvider();

    expect(provider).toBeDefined();
    expect(provider.name).toBe("gemini");
  });

  it("returns OpenAI provider when LLM_PROVIDER is 'openai'", async () => {
    process.env.LLM_PROVIDER = "openai";

    const { getLLMProvider } = await import("../llm/index");
    const provider = await getLLMProvider();

    expect(provider).toBeDefined();
    expect(provider.name).toBe("openai");
  });

  it("defaults to Claude when LLM_PROVIDER is not set", async () => {
    delete process.env.LLM_PROVIDER;

    const { getLLMProvider } = await import("../llm/index");
    const provider = await getLLMProvider();

    expect(provider).toBeDefined();
    expect(provider.name).toBe("claude");
  });

  it("throws an error for an unknown provider", async () => {
    process.env.LLM_PROVIDER = "unknown-provider";

    const { getLLMProvider } = await import("../llm/index");

    await expect(getLLMProvider()).rejects.toThrow(
      'Unknown LLM_PROVIDER: "unknown-provider". Supported: claude, gemini, openai',
    );
  });

  it("caches the provider instance on subsequent calls", async () => {
    process.env.LLM_PROVIDER = "claude";

    const { getLLMProvider } = await import("../llm/index");
    const provider1 = await getLLMProvider();
    const provider2 = await getLLMProvider();

    expect(provider1).toBe(provider2);
  });
});

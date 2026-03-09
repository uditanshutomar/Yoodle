import type {
  LLMProvider,
  STTProvider,
  TTSProvider,
  StorageProvider,
} from "@/lib/providers/types";

export const mockLLMProvider: LLMProvider = {
  name: "mock-llm",
  generateText: async () => "Mock LLM response",
  generateStream: async function* () {
    yield "Mock ";
    yield "stream";
  },
  generateMeetingMinutes: async () => ({
    summary: "Mock summary",
    keyPoints: ["Key point 1"],
    actionItems: [
      { task: "Task 1", assignee: "User", deadline: "2026-04-01" },
    ],
    decisions: ["Decision 1"],
    followUps: ["Follow up 1"],
  }),
  generateMeetingPrep: async () => ({
    talkingPoints: ["Point 1"],
    questionsToAsk: ["Question 1"],
    contextSummary: "Mock context",
  }),
  chat: async () => "Mock chat response",
  chatStream: async function* () {
    yield "Mock ";
    yield "chat";
  },
  proofread: async () => ({
    corrected: "Corrected text",
    suggestions: [],
  }),
  extractActionItems: async () => [
    { task: "Action 1", assignee: "User" },
  ],
  summarizePlan: async () => ({
    summary: "Mock plan summary",
    steps: ["Step 1"],
  }),
  estimateTaskTime: async () => ({
    estimatedMinutes: 30,
    confidence: "medium" as const,
  }),
};

export const mockSTTProvider: STTProvider = {
  name: "mock-stt",
  transcribe: async () => ({ text: "Mock transcription", segments: [] }),
};

export const mockTTSProvider: TTSProvider = {
  name: "mock-tts",
  synthesize: async () => Buffer.from("mock-audio"),
};

export const mockStorageProvider: StorageProvider = {
  name: "mock-storage",
  upload: async (key) => ({ url: `https://mock-storage.com/${key}`, key }),
  getSignedUrl: async (key) => `https://mock-storage.com/signed/${key}`,
  getUploadUrl: async (key) => `https://mock-storage.com/upload/${key}`,
  delete: async () => {},
};

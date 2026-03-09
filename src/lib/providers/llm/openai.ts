import { SYSTEM_PROMPTS } from "../../ai/prompts";
import type {
  AssistantContext,
  ChatMessage,
  LLMProvider,
  MeetingMinutes,
  MeetingPrepNotes,
  PlanSummary,
  ProofreadResult,
  TaskEstimate,
} from "../types";

// ── Types for OpenAI REST responses ─────────────────────────────────

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatChoice {
  message: { content: string | null };
}

interface OpenAIChatResponse {
  choices: OpenAIChatChoice[];
}

// ── Helpers ─────────────────────────────────────────────────────────

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

function getApiKey(): string {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY not configured");
  return apiKey;
}

/** Strip markdown code-block fences and parse JSON. */
function parseJsonResponse<T>(text: string): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as T;
}

/** Build a system prompt enriched with optional user context. */
function buildSystemInstruction(context?: AssistantContext): string {
  let instruction = SYSTEM_PROMPTS.ASSISTANT_CHAT;

  if (!context) return instruction;

  instruction += `\n\nUser Context:`;
  instruction += `\n- User's name: ${context.name}`;

  if (context.memories && context.memories.length > 0) {
    instruction += `\n- Things you remember about this user:\n  ${context.memories.join("\n  ")}`;
  }

  if (context.upcomingMeetings && context.upcomingMeetings.length > 0) {
    instruction += `\n- Upcoming meetings:\n  ${context.upcomingMeetings.join("\n  ")}`;
  }

  if (context.recentNotes && context.recentNotes.length > 0) {
    instruction += `\n- Recent notes:\n  ${context.recentNotes.join("\n  ")}`;
  }

  if (context.workspaceContext) {
    instruction += context.workspaceContext;
  }

  return instruction;
}

/** Make a non-streaming request to the OpenAI chat completions endpoint. */
async function callOpenAI(messages: OpenAIChatMessage[]): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  return data.choices[0]?.message.content ?? "";
}

/** Make a streaming request and yield text deltas via SSE parsing. */
async function* callOpenAIStream(
  messages: OpenAIChatMessage[],
): AsyncGenerator<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${body}`);
  }

  if (!response.body) {
    throw new Error("OpenAI streaming response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice(6);
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload) as {
          choices: { delta: { content?: string } }[];
        };
        const content = parsed.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }
}

/** Build the OpenAI message array from a prompt and optional system prompt. */
function buildMessages(
  prompt: string,
  systemPrompt?: string,
): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });
  return messages;
}

/** Build the OpenAI message array from ChatMessage[] with context. */
function buildChatMessages(
  messages: ChatMessage[],
  systemInstruction: string,
): OpenAIChatMessage[] {
  const openAIMessages: OpenAIChatMessage[] = [
    { role: "system", content: systemInstruction },
  ];

  for (const msg of messages) {
    openAIMessages.push({ role: msg.role, content: msg.content });
  }

  return openAIMessages;
}

// ── Provider ────────────────────────────────────────────────────────

export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai";

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    return callOpenAI(buildMessages(prompt, systemPrompt));
  }

  async *generateStream(
    prompt: string,
    systemPrompt?: string,
  ): AsyncIterable<string> {
    yield* callOpenAIStream(buildMessages(prompt, systemPrompt));
  }

  async generateMeetingMinutes(
    transcript: string,
    meetingTitle?: string,
  ): Promise<MeetingMinutes> {
    const prompt = meetingTitle
      ? `Meeting Title: ${meetingTitle}\n\nTranscript:\n${transcript}`
      : `Transcript:\n${transcript}`;

    const text = await this.generateText(prompt, SYSTEM_PROMPTS.MEETING_MINUTES);

    try {
      return parseJsonResponse<MeetingMinutes>(text);
    } catch {
      return {
        summary: text,
        keyPoints: [],
        actionItems: [],
        decisions: [],
        followUps: [],
      };
    }
  }

  async generateMeetingPrep(meeting: {
    title: string;
    agenda?: string;
    participants: string[];
    previousMeetingNotes?: string;
  }): Promise<MeetingPrepNotes> {
    const parts = [
      `Meeting Title: ${meeting.title}`,
      `Participants: ${meeting.participants.join(", ")}`,
    ];

    if (meeting.agenda) {
      parts.push(`Agenda: ${meeting.agenda}`);
    }

    if (meeting.previousMeetingNotes) {
      parts.push(`Previous Meeting Notes:\n${meeting.previousMeetingNotes}`);
    }

    const text = await this.generateText(
      parts.join("\n\n"),
      SYSTEM_PROMPTS.MEETING_PREP,
    );

    try {
      return parseJsonResponse<MeetingPrepNotes>(text);
    } catch {
      return {
        talkingPoints: [],
        questionsToAsk: [],
        contextSummary: text,
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    context?: AssistantContext,
  ): Promise<string> {
    const systemInstruction = buildSystemInstruction(context);
    return callOpenAI(buildChatMessages(messages, systemInstruction));
  }

  async *chatStream(
    messages: ChatMessage[],
    context?: AssistantContext,
  ): AsyncIterable<string> {
    const systemInstruction = buildSystemInstruction(context);
    yield* callOpenAIStream(buildChatMessages(messages, systemInstruction));
  }

  async proofread(text: string): Promise<ProofreadResult> {
    const prompt = `Please proofread the following text:\n\n${text}`;
    const result = await this.generateText(prompt, SYSTEM_PROMPTS.PROOFREAD);

    try {
      return parseJsonResponse<ProofreadResult>(result);
    } catch {
      return { corrected: text, suggestions: [] };
    }
  }

  async extractActionItems(
    text: string,
  ): Promise<MeetingMinutes["actionItems"]> {
    const prompt = `Extract action items from the following text:\n\n${text}`;
    const result = await this.generateText(prompt, SYSTEM_PROMPTS.ACTION_ITEMS);

    try {
      return parseJsonResponse<MeetingMinutes["actionItems"]>(result);
    } catch {
      return [];
    }
  }

  async summarizePlan(plan: string): Promise<PlanSummary> {
    const prompt = `Please summarize this plan:\n\n${plan}`;
    const result = await this.generateText(prompt, SYSTEM_PROMPTS.PLAN_SUMMARY);

    try {
      return parseJsonResponse<PlanSummary>(result);
    } catch {
      return { summary: result, steps: [] };
    }
  }

  async estimateTaskTime(description: string): Promise<TaskEstimate> {
    const prompt = `Estimate the time for this task:\n\n${description}`;
    const result = await this.generateText(prompt, SYSTEM_PROMPTS.TASK_TIME);

    try {
      return parseJsonResponse<TaskEstimate>(result);
    } catch {
      return { estimatedMinutes: 30, confidence: "low", breakdown: [] };
    }
  }
}

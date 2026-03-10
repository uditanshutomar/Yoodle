import { GoogleGenerativeAI } from "@google/generative-ai";

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

// ── Helpers ─────────────────────────────────────────────────────────

/** Strip markdown code-block fences and parse JSON. */
function parseJsonResponse<T>(text: string): T {
  // LLMs sometimes wrap JSON in markdown code blocks, possibly with surrounding text.
  // Try to extract JSON from a code fence first; fall back to the raw text.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();

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

// ── Provider ────────────────────────────────────────────────────────

const MODEL = "gemini-2.0-flash";

export class GeminiLLMProvider implements LLMProvider {
  readonly name = "gemini";

  // Memoize the client so we don't create a new GoogleGenerativeAI
  // instance on every API call. The client is stateless and safe to reuse.
  private cachedClient: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (this.cachedClient) return this.cachedClient;
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error("LLM_API_KEY not configured");
    this.cachedClient = new GoogleGenerativeAI(apiKey);
    return this.cachedClient;
  }

  private getModel() {
    return this.getClient().getGenerativeModel({ model: MODEL });
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const model = this.getModel();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(systemPrompt
        ? {
            systemInstruction: {
              role: "user" as const,
              parts: [{ text: systemPrompt }],
            },
          }
        : {}),
    });

    return result.response.text();
  }

  async *generateStream(
    prompt: string,
    systemPrompt?: string,
  ): AsyncIterable<string> {
    const model = this.getModel();

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(systemPrompt
        ? {
            systemInstruction: {
              role: "user" as const,
              parts: [{ text: systemPrompt }],
            },
          }
        : {}),
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
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
    const model = this.getModel();
    const systemInstruction = buildSystemInstruction(context);

    const contents = messages.map((msg) => ({
      role: msg.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: msg.content }],
    }));

    const result = await model.generateContent({
      contents,
      systemInstruction: {
        role: "user" as const,
        parts: [{ text: systemInstruction }],
      },
    });

    return result.response.text();
  }

  async *chatStream(
    messages: ChatMessage[],
    context?: AssistantContext,
  ): AsyncIterable<string> {
    const model = this.getModel();
    const systemInstruction = buildSystemInstruction(context);

    const contents = messages.map((msg) => ({
      role: msg.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: msg.content }],
    }));

    const result = await model.generateContentStream({
      contents,
      systemInstruction: {
        role: "user" as const,
        parts: [{ text: systemInstruction }],
      },
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
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

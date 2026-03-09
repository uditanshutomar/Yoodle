import Anthropic from "@anthropic-ai/sdk";

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

function getClient(): Anthropic {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY not configured");
  return new Anthropic({ apiKey });
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

/** Convert ChatMessage[] to Anthropic message params. */
function toAnthropicMessages(
  messages: ChatMessage[],
): Anthropic.MessageParam[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

// ── Provider ────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";

export class ClaudeLLMProvider implements LLMProvider {
  readonly name = "claude";

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const client = getClient();

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    return block.type === "text" ? block.text : "";
  }

  async *generateStream(
    prompt: string,
    systemPrompt?: string,
  ): AsyncIterable<string> {
    const client = getClient();

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
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
    const client = getClient();
    const systemInstruction = buildSystemInstruction(context);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemInstruction,
      messages: toAnthropicMessages(messages),
    });

    const block = message.content[0];
    return block.type === "text" ? block.text : "";
  }

  async *chatStream(
    messages: ChatMessage[],
    context?: AssistantContext,
  ): AsyncIterable<string> {
    const client = getClient();
    const systemInstruction = buildSystemInstruction(context);

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemInstruction,
      messages: toAnthropicMessages(messages),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
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

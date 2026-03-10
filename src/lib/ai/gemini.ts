import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { SYSTEM_PROMPTS } from "./prompts";

// ── Singleton Gemini client ─────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function getModel(modelName = "gemini-2.0-flash"): GenerativeModel {
  return getClient().getGenerativeModel({ model: modelName });
}

// ── Helper: parse JSON from Gemini response ─────────────────────────

function parseJsonResponse<T>(text: string): T {
  // LLMs sometimes wrap JSON in markdown code blocks, possibly with surrounding text.
  // Try to extract JSON from a code fence first; fall back to the raw text.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();

  return JSON.parse(cleaned) as T;
}

// ── Core functions ──────────────────────────────────────────────────

export async function generateText(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const model = getModel();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(systemInstruction
      ? { systemInstruction: { role: "user", parts: [{ text: systemInstruction }] } }
      : {}),
  });

  const response = result.response;
  return response.text();
}

export async function* generateStream(
  prompt: string,
  systemInstruction?: string
): AsyncGenerator<string> {
  const model = getModel();

  const result = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(systemInstruction
      ? { systemInstruction: { role: "user", parts: [{ text: systemInstruction }] } }
      : {}),
  });

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
    }
  }
}

// ── Meeting Minutes ─────────────────────────────────────────────────

export async function generateMeetingMinutes(
  transcript: string,
  meetingTitle?: string
): Promise<{
  summary: string;
  keyPoints: string[];
  actionItems: { task: string; assignee?: string; deadline?: string }[];
  decisions: string[];
  followUps: string[];
}> {
  const prompt = meetingTitle
    ? `Meeting Title: ${meetingTitle}\n\nTranscript:\n${transcript}`
    : `Transcript:\n${transcript}`;

  const text = await generateText(prompt, SYSTEM_PROMPTS.MEETING_MINUTES);

  try {
    return parseJsonResponse(text);
  } catch {
    // If JSON parsing fails, return a structured fallback
    return {
      summary: text,
      keyPoints: [],
      actionItems: [],
      decisions: [],
      followUps: [],
    };
  }
}

// ── Meeting Prep ────────────────────────────────────────────────────

export async function generateMeetingPrep(upcomingMeeting: {
  title: string;
  agenda?: string;
  participants: string[];
  previousMeetingNotes?: string;
}): Promise<{
  talkingPoints: string[];
  questionsToAsk: string[];
  contextSummary: string;
}> {
  const parts = [
    `Meeting Title: ${upcomingMeeting.title}`,
    `Participants: ${upcomingMeeting.participants.join(", ")}`,
  ];

  if (upcomingMeeting.agenda) {
    parts.push(`Agenda: ${upcomingMeeting.agenda}`);
  }

  if (upcomingMeeting.previousMeetingNotes) {
    parts.push(
      `Previous Meeting Notes:\n${upcomingMeeting.previousMeetingNotes}`
    );
  }

  const prompt = parts.join("\n\n");
  const text = await generateText(prompt, SYSTEM_PROMPTS.MEETING_PREP);

  try {
    return parseJsonResponse(text);
  } catch {
    return {
      talkingPoints: [],
      questionsToAsk: [],
      contextSummary: text,
    };
  }
}

// ── Proofread ───────────────────────────────────────────────────────

export async function proofreadText(text: string): Promise<{
  corrected: string;
  suggestions: { original: string; suggested: string; reason: string }[];
}> {
  const prompt = `Please proofread the following text:\n\n${text}`;
  const result = await generateText(prompt, SYSTEM_PROMPTS.PROOFREAD);

  try {
    return parseJsonResponse(result);
  } catch {
    return {
      corrected: text,
      suggestions: [],
    };
  }
}

// ── Plan Summary ────────────────────────────────────────────────────

export async function summarizePlan(plan: string): Promise<{
  summary: string;
  steps: string[];
  estimatedTime?: string;
  risks?: string[];
}> {
  const prompt = `Please summarize this plan:\n\n${plan}`;
  const result = await generateText(prompt, SYSTEM_PROMPTS.PLAN_SUMMARY);

  try {
    return parseJsonResponse(result);
  } catch {
    return {
      summary: result,
      steps: [],
    };
  }
}

// ── Action Items ────────────────────────────────────────────────────

export async function extractActionItems(
  text: string
): Promise<
  {
    task: string;
    assignee?: string;
    priority?: "high" | "medium" | "low";
    deadline?: string;
  }[]
> {
  const prompt = `Extract action items from the following text:\n\n${text}`;
  const result = await generateText(prompt, SYSTEM_PROMPTS.ACTION_ITEMS);

  try {
    return parseJsonResponse(result);
  } catch {
    return [];
  }
}

// ── Task Time Estimation ────────────────────────────────────────────

export async function estimateTaskTime(
  taskDescription: string
): Promise<{
  estimatedMinutes: number;
  confidence: "high" | "medium" | "low";
  breakdown?: string[];
}> {
  const prompt = `Estimate the time for this task:\n\n${taskDescription}`;
  const result = await generateText(prompt, SYSTEM_PROMPTS.TASK_TIME);

  try {
    return parseJsonResponse(result);
  } catch {
    return {
      estimatedMinutes: 30,
      confidence: "low",
      breakdown: [],
    };
  }
}

// ── Chat with Assistant ─────────────────────────────────────────────

// ── User context type shared by chat functions ─────────────────────

interface AssistantUserContext {
  name: string;
  memories?: string[];
  upcomingMeetings?: string[];
  recentNotes?: string[];
  workspaceContext?: string;
}

/** Build the full system instruction with user + workspace context */
function buildSystemInstruction(userContext?: AssistantUserContext): string {
  let systemInstruction = SYSTEM_PROMPTS.ASSISTANT_CHAT;

  if (userContext) {
    systemInstruction += `\n\nUser Context:`;
    systemInstruction += `\n- User's name: ${userContext.name}`;

    if (userContext.memories && userContext.memories.length > 0) {
      systemInstruction += `\n- Things you remember about this user:\n  ${userContext.memories.join("\n  ")}`;
    }

    if (userContext.upcomingMeetings && userContext.upcomingMeetings.length > 0) {
      systemInstruction += `\n- Upcoming meetings:\n  ${userContext.upcomingMeetings.join("\n  ")}`;
    }

    if (userContext.recentNotes && userContext.recentNotes.length > 0) {
      systemInstruction += `\n- Recent notes:\n  ${userContext.recentNotes.join("\n  ")}`;
    }

    if (userContext.workspaceContext) {
      systemInstruction += userContext.workspaceContext;
    }
  }

  return systemInstruction;
}

export async function chatWithAssistant(
  messages: { role: "user" | "model"; content: string }[],
  userContext?: AssistantUserContext
): Promise<string> {
  const model = getModel();

  const systemInstruction = buildSystemInstruction(userContext);

  // Convert messages to Gemini format
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

// ── Streaming Chat with Assistant ───────────────────────────────────

export async function* streamChatWithAssistant(
  messages: { role: "user" | "model"; content: string }[],
  userContext?: AssistantUserContext
): AsyncGenerator<string> {
  const model = getModel();

  const systemInstruction = buildSystemInstruction(userContext);

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

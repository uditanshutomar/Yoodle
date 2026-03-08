import { generateText } from "./gemini";
import { SYSTEM_PROMPTS } from "./prompts";

// ── Types ───────────────────────────────────────────────────────────

export interface TranscriptAnalysis {
  myActionItems: { task: string; deadline?: string; priority: "high" | "medium" | "low" }[];
  relevantDecisions: string[];
  personalTakeaways: string[];
  nextMeetingPrep: {
    talkingPoints: string[];
    pendingQuestions: string[];
    followUpsFromLast: string[];
  };
  workSuggestions: { suggestion: string; reasoning: string; priority: "high" | "medium" | "low" }[];
  workFlaws: { area: string; issue: string; suggestedFix: string; severity: "critical" | "moderate" | "minor" }[];
  mentionedFiles: string[];
}

export interface ScheduleSuggestion {
  taskTitle: string;
  estimatedMinutes: number;
  suggestedSlots: { start: string; end: string; reason: string }[];
  priority: "high" | "medium" | "low";
}

export interface CollabScheduleResult {
  bestSlots: { start: string; end: string; score: number; reason: string }[];
  conflicts: string[];
}

export interface WorkReview {
  strengths: string[];
  flaws: { area: string; issue: string; suggestedFix: string; severity: "critical" | "moderate" | "minor" }[];
  suggestions: { suggestion: string; reasoning: string; priority: "high" | "medium" | "low" }[];
  overallAssessment: string;
}

// ── Helper ──────────────────────────────────────────────────────────

function parseJsonSafe<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ── Transcript Analysis ─────────────────────────────────────────────

/**
 * Analyze a meeting transcript from a specific user's perspective.
 * Extracts action items, decisions, takeaways, next-meeting prep,
 * work suggestions, and identified flaws.
 */
export async function analyzeTranscriptForUser(
  transcript: string,
  userName: string,
  meetingTitle: string,
  pendingTasks: string[]
): Promise<TranscriptAnalysis> {
  const taskContext =
    pendingTasks.length > 0
      ? `\n\nUser's current pending tasks:\n${pendingTasks.map((t) => `- ${t}`).join("\n")}`
      : "";

  const prompt = `Meeting: "${meetingTitle}"
User: ${userName}
${taskContext}

Transcript:
${transcript}`;

  const text = await generateText(prompt, SYSTEM_PROMPTS.TRANSCRIPT_ANALYSIS);

  return parseJsonSafe<TranscriptAnalysis>(text, {
    myActionItems: [],
    relevantDecisions: [],
    personalTakeaways: [],
    nextMeetingPrep: { talkingPoints: [], pendingQuestions: [], followUpsFromLast: [] },
    workSuggestions: [],
    workFlaws: [],
    mentionedFiles: [],
  });
}

// ── Smart Scheduling ────────────────────────────────────────────────

/**
 * Given tasks and existing calendar busy blocks, suggest optimal
 * time slots for each task.
 */
export async function suggestSchedule(
  tasks: { title: string; estimatedMinutes: number; priority: "high" | "medium" | "low"; dueDate?: string }[],
  busyBlocks: { start: string; end: string }[],
  workingHours: { start: number; end: number },
  dateRange: { from: string; to: string }
): Promise<ScheduleSuggestion[]> {
  const prompt = `Tasks to schedule:
${tasks.map((t) => `- "${t.title}" (~${t.estimatedMinutes}min, priority: ${t.priority}${t.dueDate ? `, due: ${t.dueDate}` : ""})`).join("\n")}

Existing busy blocks:
${busyBlocks.map((b) => `- ${b.start} to ${b.end}`).join("\n") || "None"}

Working hours: ${workingHours.start}:00 to ${workingHours.end}:00
Date range: ${dateRange.from} to ${dateRange.to}`;

  const text = await generateText(prompt, SYSTEM_PROMPTS.SMART_SCHEDULING);

  return parseJsonSafe<ScheduleSuggestion[]>(text, []);
}

// ── Collaboration Scheduling ────────────────────────────────────────

/**
 * Find the best overlapping free slots between two users' calendars
 * for working on a shared task.
 */
export async function findCollabSlots(
  userAName: string,
  userABusy: { start: string; end: string }[],
  userBName: string,
  userBBusy: { start: string; end: string }[],
  taskTitle: string,
  durationMinutes: number,
  dateRange: { from: string; to: string },
  workingHours: { start: number; end: number }
): Promise<CollabScheduleResult> {
  const prompt = `Find the best time for ${userAName} and ${userBName} to collaborate on "${taskTitle}" (~${durationMinutes} minutes).

${userAName}'s busy times:
${userABusy.map((b) => `- ${b.start} to ${b.end}`).join("\n") || "None"}

${userBName}'s busy times:
${userBBusy.map((b) => `- ${b.start} to ${b.end}`).join("\n") || "None"}

Working hours: ${workingHours.start}:00 to ${workingHours.end}:00
Date range: ${dateRange.from} to ${dateRange.to}`;

  const text = await generateText(prompt, SYSTEM_PROMPTS.COLLAB_SCHEDULING);

  return parseJsonSafe<CollabScheduleResult>(text, {
    bestSlots: [],
    conflicts: [],
  });
}

// ── Work Review ─────────────────────────────────────────────────────

/**
 * Review a piece of work (document content, code, plan, etc.)
 * and provide suggestions and identify flaws.
 */
export async function reviewWork(
  workContent: string,
  workType: string,
  context?: string
): Promise<WorkReview> {
  const prompt = `Work type: ${workType}
${context ? `Context: ${context}\n` : ""}
Content to review:
${workContent}`;

  const text = await generateText(prompt, SYSTEM_PROMPTS.WORK_REVIEW);

  return parseJsonSafe<WorkReview>(text, {
    strengths: [],
    flaws: [],
    suggestions: [],
    overallAssessment: "Unable to generate review.",
  });
}

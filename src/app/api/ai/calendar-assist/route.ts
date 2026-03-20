import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import { createLogger } from "@/lib/infra/logger";
import { getClient, getModelName } from "@/lib/ai/gemini";
import { geminiBreaker } from "@/lib/infra/circuit-breaker";
import { listEvents } from "@/lib/google/calendar";
import { searchContacts } from "@/lib/google/contacts";
import { searchFiles } from "@/lib/google/drive";
import { searchBoardTasks } from "@/lib/board/tools";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user";
import Board from "@/lib/infra/db/models/board";

const log = createLogger("api:ai:calendar-assist");

const baseSchema = z.object({
  field: z.enum(["titles", "attendees", "agenda", "references"]),
});

const titlesSchema = z.object({
  field: z.literal("titles"),
  partial: z.string().min(3).max(200),
});

const attendeesSchema = z.object({
  field: z.literal("attendees"),
  title: z.string().min(1).max(200),
  existingAttendees: z.array(z.string()).default([]),
});

const agendaSchema = z.object({
  field: z.literal("agenda"),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).default([]),
});

const referencesSchema = z.object({
  field: z.literal("references"),
  title: z.string().min(1).max(200),
  attendees: z.array(z.string()).default([]),
  agenda: z.string().default(""),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const body = await req.json();
  const { field } = baseSchema.parse(body);

  switch (field) {
    case "titles": {
      const input = titlesSchema.parse(body);
      return successResponse(await suggestTitles(userId, input));
    }
    case "attendees": {
      const input = attendeesSchema.parse(body);
      return successResponse(await suggestAttendees(userId, input));
    }
    case "agenda": {
      const input = agendaSchema.parse(body);
      return successResponse(await suggestAgenda(userId, input));
    }
    case "references": {
      const input = referencesSchema.parse(body);
      return successResponse(await suggestReferences(userId, input));
    }
    default:
      throw new BadRequestError("Unknown field type.");
  }
});

function cleanJsonResponse(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function suggestTitles(userId: string, input: z.infer<typeof titlesSchema>) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const userOid = new mongoose.Types.ObjectId(userId);

  // Gather calendar events and Yoodle meetings in parallel
  const [calendarResult, meetingsResult] = await Promise.allSettled([
    listEvents(userId, {
      timeMin: thirtyDaysAgo.toISOString(),
      timeMax: now.toISOString(),
      maxResults: 50,
    }),
    Meeting.find({
      $or: [{ hostId: userOid }, { "participants.userId": userOid }],
      createdAt: { $gte: thirtyDaysAgo },
    })
      .select("title description code")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const calendarEvents = calendarResult.status === "fulfilled" ? calendarResult.value : [];
  const yoodleMeetings = meetingsResult.status === "fulfilled" ? meetingsResult.value : [];

  // Count Yoodle room usage from calendar events
  const yoodleRoomPattern = /\/meetings\/yoo-/i;
  let yoodleRoomCount = 0;
  let totalMeetingCount = calendarEvents.length + yoodleMeetings.length;

  for (const event of calendarEvents) {
    if (
      (event.location && yoodleRoomPattern.test(event.location)) ||
      (event.description && yoodleRoomPattern.test(event.description))
    ) {
      yoodleRoomCount++;
    }
  }

  // All Yoodle meetings count as Yoodle room usage
  yoodleRoomCount += yoodleMeetings.length;

  const pastTitles = [
    ...calendarEvents.map((e) => e.title),
    ...yoodleMeetings.map((m) => m.title),
  ].filter(Boolean);

  const uniqueTitles = [...new Set(pastTitles)].slice(0, 30);

  // Ask Gemini for title completions
  try {
    const ai = getClient();
    const model = getModelName();

    const prompt = `You are an assistant that suggests meeting titles. The user is typing a meeting title and needs completions.

Partial input: "${input.partial}"

Recent meeting titles for context:
${uniqueTitles.map((t) => `- ${t}`).join("\n")}

Suggest 3-5 natural completions of the partial input. Each suggestion should be a plausible meeting title based on the user's history and the partial text.

Respond with JSON only: {"titles":[{"value":"...","reason":"..."}]}`;

    const result = await geminiBreaker.execute(() =>
      ai.models.generateContent({ model, contents: prompt })
    );

    const cleaned = cleanJsonResponse(result.text ?? "");
    const parsed = JSON.parse(cleaned);
    const suggestions = (parsed.titles || []).map((t: { value: string; reason: string }) => ({
      value: t.value,
      reason: t.reason,
    }));

    const suggestYoodleRoom = totalMeetingCount > 0 && yoodleRoomCount / totalMeetingCount > 0.4;

    return {
      suggestions,
      suggestYoodleRoom,
      yoodleRoomReason: suggestYoodleRoom
        ? `Over ${Math.round((yoodleRoomCount / totalMeetingCount) * 100)}% of your recent meetings used Yoodle Rooms.`
        : "",
    };
  } catch (err) {
    log.error({ err }, "Failed to generate title suggestions");
    const suggestYoodleRoom = totalMeetingCount > 0 && yoodleRoomCount / totalMeetingCount > 0.4;
    return {
      suggestions: [],
      suggestYoodleRoom,
      yoodleRoomReason: suggestYoodleRoom
        ? `Over ${Math.round((yoodleRoomCount / totalMeetingCount) * 100)}% of your recent meetings used Yoodle Rooms.`
        : "",
    };
  }
}

async function suggestAttendees(userId: string, input: z.infer<typeof attendeesSchema>) {
  const userOid = new mongoose.Types.ObjectId(userId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Extract keywords from the title for contact search
  const keywords = input.title
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .join(" ");

  // Gather contacts, board members, and recent meeting participants in parallel
  const [contactsResult, boardsResult, meetingsResult] = await Promise.allSettled([
    searchContacts(userId, keywords, 10),
    Board.find({ "members.userId": userOid }).select("members.userId title").lean(),
    Meeting.find({
      $or: [{ hostId: userOid }, { "participants.userId": userOid }],
      createdAt: { $gte: thirtyDaysAgo },
    })
      .select("participants.userId title")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
  ]);

  const contacts = contactsResult.status === "fulfilled" ? contactsResult.value : [];
  const boards = boardsResult.status === "fulfilled" ? boardsResult.value : [];
  const meetings = meetingsResult.status === "fulfilled" ? meetingsResult.value : [];

  // Build candidate map: userId -> { frequency, sources }
  const candidateMap = new Map<string, { frequency: number; sources: Set<string> }>();

  const addCandidate = (id: string, source: string) => {
    if (id === userId) return; // exclude self
    if (input.existingAttendees.includes(id)) return; // exclude existing
    const existing = candidateMap.get(id);
    if (existing) {
      existing.frequency++;
      existing.sources.add(source);
    } else {
      candidateMap.set(id, { frequency: 1, sources: new Set([source]) });
    }
  };

  // Add contacts (by email match — contacts don't have userId, so we'll resolve later)
  // For now, track contact emails separately
  const contactEmails = new Map<string, { name: string; email: string }>();
  for (const contact of contacts) {
    if (contact.email) {
      contactEmails.set(contact.email, { name: contact.name, email: contact.email });
    }
  }

  // Add board members
  for (const board of boards) {
    const members = (board as unknown as { members: { userId: mongoose.Types.ObjectId }[] }).members || [];
    for (const member of members) {
      addCandidate(member.userId.toString(), "board collaborator");
    }
  }

  // Add recent meeting participants
  for (const meeting of meetings) {
    const participants = (meeting as unknown as { participants: { userId: mongoose.Types.ObjectId }[] }).participants || [];
    for (const p of participants) {
      addCandidate(p.userId.toString(), "recent meeting participant");
    }
  }

  // Sort candidates by frequency (descending) and take top 8
  const topCandidateIds = [...candidateMap.entries()]
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 8)
    .map(([id]) => id);

  if (topCandidateIds.length === 0) {
    return { suggestions: [] };
  }

  // Fetch user profiles for top candidates
  const users = await User.find({
    _id: { $in: topCandidateIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("name displayName avatarUrl status mode")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  // Build final suggestions (top 5)
  const suggestions = topCandidateIds
    .map((id) => {
      const user = userMap.get(id);
      if (!user) return null;
      const candidate = candidateMap.get(id)!;
      const sources = [...candidate.sources];
      const reason = sources.length > 1
        ? `Appears as ${sources.join(" and ")} (${candidate.frequency} interactions)`
        : `${sources[0]} (${candidate.frequency} interactions)`;
      return {
        userId: id,
        name: user.name,
        displayName: user.displayName,
        avatarUrl: (user as unknown as { avatarUrl?: string }).avatarUrl || null,
        reason,
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  return { suggestions };
}

async function suggestAgenda(userId: string, input: z.infer<typeof agendaSchema>) {
  const userOid = new mongoose.Types.ObjectId(userId);

  // Extract keywords from the title
  const keywords = input.title
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .join(" ");

  // Gather board tasks, recent similar-titled meetings, and relevant Drive docs in parallel
  const [tasksResult, meetingsResult, driveResult] = await Promise.allSettled([
    searchBoardTasks(userId, { query: keywords }),
    Meeting.find({
      $or: [{ hostId: userOid }, { "participants.userId": userOid }],
      title: { $regex: keywords.split(" ")[0] || "", $options: "i" },
    })
      .select("title description mom")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    searchFiles(userId, keywords, 5),
  ]);

  const tasks: { title: string; priority?: string; dueDate?: string }[] =
    tasksResult.status === "fulfilled" && tasksResult.value.success && Array.isArray(tasksResult.value.data)
      ? tasksResult.value.data
      : [];
  const meetings = meetingsResult.status === "fulfilled" ? meetingsResult.value : [];
  const driveFiles = driveResult.status === "fulfilled" ? driveResult.value : [];

  // Build context string
  const contextParts: string[] = [];

  if (tasks.length > 0) {
    contextParts.push("Relevant board tasks:");
    for (const t of tasks.slice(0, 10)) {
      contextParts.push(`- ${t.title}${t.priority ? ` [${t.priority}]` : ""}${t.dueDate ? ` (due: ${t.dueDate})` : ""}`);
    }
  }

  if (meetings.length > 0) {
    contextParts.push("\nPast similar meetings:");
    for (const meeting of meetings) {
      const m = meeting as unknown as { title: string; description?: string; mom?: { summary?: string; discussionPoints?: string[] } };
      contextParts.push(`- "${m.title}"${m.description ? `: ${m.description}` : ""}`);
      if (m.mom?.discussionPoints?.length) {
        contextParts.push(`  Discussion points: ${m.mom.discussionPoints.slice(0, 3).join(", ")}`);
      }
    }
  }

  if (driveFiles.length > 0) {
    contextParts.push("\nRelated documents from Drive:");
    for (const file of driveFiles.slice(0, 5)) {
      contextParts.push(`- "${file.name}" (${file.mimeType?.replace("application/vnd.google-apps.", "") || "file"}, last modified: ${file.modifiedTime || "unknown"})`);
    }
  }

  const context = contextParts.join("\n");

  // Ask Gemini for agenda suggestions
  try {
    const ai = getClient();
    const model = getModelName();

    const prompt = `You are an assistant that suggests meeting agenda items. Based on the meeting title, recent tasks, past meetings, and related documents, suggest relevant agenda items.

Meeting title: "${input.title}"
${input.attendees.length > 0 ? `Attendees: ${input.attendees.length} people` : ""}

${context || "No additional context available."}

Suggest 3-5 concise, actionable agenda items that would be appropriate for this meeting. Each item should be a specific talking point or discussion topic synthesized from the context above (tasks, past meetings, documents). Do NOT suggest just document titles or links — suggest actual discussion points.

For the "reason" field, briefly explain what data (task, past meeting, or document) informed this suggestion.

Respond with JSON only: {"items":[{"value":"...","reason":"..."}]}`;

    const result = await geminiBreaker.execute(() =>
      ai.models.generateContent({ model, contents: prompt })
    );

    const cleaned = cleanJsonResponse(result.text ?? "");
    const parsed = JSON.parse(cleaned);
    const suggestions = (parsed.items || []).map((item: { value: string; reason: string }) => ({
      value: item.value,
      reason: item.reason,
    }));

    return { suggestions };
  } catch (err) {
    log.error({ err }, "Failed to generate agenda suggestions");
    return { suggestions: [] };
  }
}

async function suggestReferences(userId: string, input: z.infer<typeof referencesSchema>) {
  // Build search query from title and agenda keywords
  const titleWords = input.title.split(/\s+/).filter((w) => w.length > 2);
  const agendaWords = input.agenda
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 5);
  const searchQuery = [...new Set([...titleWords, ...agendaWords])].slice(0, 6).join(" ");

  if (!searchQuery) {
    return { suggestions: [] };
  }

  // Search Drive for matching files
  let files;
  try {
    files = await searchFiles(userId, searchQuery, 8);
  } catch (err) {
    log.error({ err }, "Failed to search Drive files");
    return { suggestions: [] };
  }

  if (files.length === 0) {
    return { suggestions: [] };
  }

  // Ask Gemini to rank the most relevant files
  try {
    const ai = getClient();
    const model = getModelName();

    const fileList = files
      .map((f, i) => `${i + 1}. "${f.name}" (type: ${f.mimeType}, modified: ${f.modifiedTime || "unknown"})`)
      .join("\n");

    const prompt = `You are an assistant that recommends reference documents for meetings.

Meeting title: "${input.title}"
${input.agenda ? `Agenda: ${input.agenda}` : ""}

Available files:
${fileList}

Pick the 3-5 most relevant files for this meeting. For each, explain briefly why it is relevant.

Respond with JSON only: {"picks":[{"index":1,"reason":"..."}]}`;

    const result = await geminiBreaker.execute(() =>
      ai.models.generateContent({ model, contents: prompt })
    );

    const cleaned = cleanJsonResponse(result.text ?? "");
    const parsed = JSON.parse(cleaned);

    const mimeTypeMap: Record<string, string> = {
      "application/vnd.google-apps.document": "doc",
      "application/vnd.google-apps.spreadsheet": "sheet",
      "application/vnd.google-apps.presentation": "slide",
      "application/pdf": "pdf",
    };

    const suggestions = (parsed.picks || [])
      .filter((pick: { index: number }) => pick.index >= 1 && pick.index <= files.length)
      .map((pick: { index: number; reason: string }) => {
        const file = files[pick.index - 1];
        return {
          title: file.name,
          url: file.webViewLink || "",
          type: mimeTypeMap[file.mimeType] || "file",
          reason: pick.reason,
        };
      });

    return { suggestions };
  } catch (err) {
    log.error({ err }, "Failed to rank reference files");
    // Fall back to returning all files without ranking
    const mimeTypeMap: Record<string, string> = {
      "application/vnd.google-apps.document": "doc",
      "application/vnd.google-apps.spreadsheet": "sheet",
      "application/vnd.google-apps.presentation": "slide",
      "application/pdf": "pdf",
    };

    return {
      suggestions: files.slice(0, 5).map((f) => ({
        title: f.name,
        url: f.webViewLink || "",
        type: mimeTypeMap[f.mimeType] || "file",
        reason: "Matched search keywords",
      })),
    };
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/client";
import AIMemory from "@/lib/db/models/ai-memory";
import Agent from "@/lib/db/models/agent";
import { authenticateRequest } from "@/lib/auth/middleware";
import { streamChatWithAssistant } from "@/lib/ai/gemini";
import { createStreamingResponse } from "@/lib/ai/streaming";
import { buildWorkspaceContext } from "@/lib/google/workspace-context";
import {
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Validation ──────────────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "model", "assistant"]),
  content: z.string().min(1, "Message content is required."),
});

// Accept both frontend format { message, history } and direct { messages }
const chatSchema = z.union([
  z.object({
    message: z.string().min(1, "Message is required."),
    history: z.array(messageSchema).optional().default([]),
    context: z
      .object({
        name: z.string().optional(),
        upcomingMeetings: z.array(z.string()).optional(),
        recentNotes: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  z.object({
    messages: z
      .array(messageSchema)
      .min(1, "At least one message is required."),
    context: z
      .object({
        name: z.string().optional(),
        upcomingMeetings: z.array(z.string()).optional(),
        recentNotes: z.array(z.string()).optional(),
      })
      .optional(),
  }),
]);

/** Normalize chat input into Gemini-compatible messages array */
function normalizeChatInput(
  data: z.infer<typeof chatSchema>
): { messages: { role: "user" | "model"; content: string }[]; context?: { name?: string; upcomingMeetings?: string[]; recentNotes?: string[] } } {
  if ("message" in data) {
    // Frontend format: { message, history }
    const history = (data.history || []).map((m) => ({
      role: (m.role === "assistant" ? "model" : m.role) as "user" | "model",
      content: m.content,
    }));
    return {
      messages: [...history, { role: "user" as const, content: data.message }],
      context: data.context,
    };
  }
  // Direct format: { messages }
  const messages = data.messages.map((m) => ({
    role: (m.role === "assistant" ? "model" : m.role) as "user" | "model",
    content: m.content,
  }));
  return { messages, context: data.context };
}

// ── POST /api/ai/chat ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();

    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: fieldErrors,
      });
    }

    const { messages, context } = normalizeChatInput(parsed.data);

    // Load user's AI memories and Google Workspace context in parallel
    await connectDB();

    // Ensure the user has an agent (auto-create if not) and mark it active
    await Agent.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId, name: "Doodle", status: "active", capabilities: ["chat", "meeting-prep", "meeting-minutes", "proofreading", "task-management", "gmail", "calendar", "drive", "docs", "sheets", "tasks", "contacts"] },
        $set: { lastActiveAt: new Date(), status: "active" },
      },
      { upsert: true, new: true }
    );

    const [memories, workspaceContext] = await Promise.all([
      AIMemory.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
      buildWorkspaceContext(userId).catch((err) => {
        console.error("[Workspace Context Error]", err);
        return "";
      }),
    ]);

    const memoryStrings = memories.map(
      (m) => `[${m.category}] ${m.content}`
    );

    // Build user context for the assistant
    const userContext = {
      name: context?.name || "User",
      memories: memoryStrings.length > 0 ? memoryStrings : undefined,
      upcomingMeetings: context?.upcomingMeetings,
      recentNotes: context?.recentNotes,
      workspaceContext: workspaceContext || undefined,
    };

    // Stream the response
    const generator = streamChatWithAssistant(messages, userContext);
    return createStreamingResponse(generator);
  } catch (error) {
    console.error("[AI Chat Error]", error);
    return serverErrorResponse("Failed to process chat request.");
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import AIMemory from "@/lib/db/models/ai-memory";
import { streamChatWithAssistant } from "@/lib/ai/gemini";
import { createStreamingResponse } from "@/lib/ai/streaming";
import { buildWorkspaceContext } from "@/lib/google/workspace-context";

// -- Validation ----------------------------------------------------------------

const messageSchema = z.object({
  role: z.enum(["user", "model", "assistant"]),
  content: z.string().min(1, "Message content is required.").max(8000, "Message too long (max 8000 chars)."),
});

// Accept both frontend format { message, history } and direct { messages }
const chatSchema = z.union([
  z.object({
    message: z.string().min(1, "Message is required.").max(8000, "Message too long (max 8000 chars)."),
    history: z.array(messageSchema).max(50, "Too many history messages (max 50).").optional().default([]),
    context: z
      .object({
        name: z.string().max(100).optional(),
        upcomingMeetings: z.array(z.string().max(500)).max(20).optional(),
        recentNotes: z.array(z.string().max(2000)).max(20).optional(),
      })
      .optional(),
  }),
  z.object({
    messages: z
      .array(messageSchema)
      .min(1, "At least one message is required.")
      .max(50, "Too many messages (max 50)."),
    context: z
      .object({
        name: z.string().max(100).optional(),
        upcomingMeetings: z.array(z.string().max(500)).max(20).optional(),
        recentNotes: z.array(z.string().max(2000)).max(20).optional(),
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

// -- POST /api/ai/chat ---------------------------------------------------------

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = chatSchema.parse(await req.json());
  const { messages, context } = normalizeChatInput(body);

  // Load user's AI memories and Google Workspace context in parallel
  await connectDB();

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
});

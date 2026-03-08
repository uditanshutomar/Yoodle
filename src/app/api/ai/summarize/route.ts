import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  generateMeetingMinutes,
  summarizePlan,
  generateText,
} from "@/lib/ai/gemini";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Validation ──────────────────────────────────────────────────────

const summarizeSchema = z.object({
  text: z.string().min(1, "Text is required."),
  type: z.enum(["plan", "meeting", "general"]).default("general"),
  title: z.string().optional(),
});

// ── POST /api/ai/summarize ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    // Suppress unused variable warning — userId validates auth
    void userId;

    const body = await request.json();

    const parsed = summarizeSchema.safeParse(body);
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

    const { text, type, title } = parsed.data;

    let result: unknown;

    switch (type) {
      case "meeting":
        result = await generateMeetingMinutes(text, title);
        break;

      case "plan":
        result = await summarizePlan(text);
        break;

      case "general":
      default: {
        const summary = await generateText(
          `Please provide a concise summary of the following text:\n\n${text}`,
          "You are Doodle, Yoodle's AI assistant. Summarize the text clearly and concisely. Be Gen Z friendly but professional."
        );
        result = { summary };
        break;
      }
    }

    return successResponse(result);
  } catch (error) {
    console.error("[AI Summarize Error]", error);
    return serverErrorResponse("Failed to summarize text.");
  }
}

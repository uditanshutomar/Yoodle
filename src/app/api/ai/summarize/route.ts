import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import {
  generateMeetingMinutes,
  summarizePlan,
  generateText,
} from "@/lib/ai/gemini";

// -- Validation ----------------------------------------------------------------

const summarizeSchema = z.object({
  text: z.string().min(1, "Text is required."),
  type: z.enum(["plan", "meeting", "general"]).default("general"),
  title: z.string().optional(),
});

// -- POST /api/ai/summarize ----------------------------------------------------

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  // Suppress unused variable warning -- userId validates auth
  void userId;

  const body = summarizeSchema.parse(await req.json());
  const { text, type, title } = body;

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
});

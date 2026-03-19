import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts";
import { successResponse } from "@/lib/infra/api/response";
import { AppError } from "@/lib/infra/api/errors";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:ai-action-revise");

const reviseSchema = z.object({
  actionType: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  summary: z.string().min(1),
  userFeedback: z.string().min(1).max(2000),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  await getUserIdFromRequest(req); // auth check

  const body = reviseSchema.parse(await req.json());

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log.error("GEMINI_API_KEY not configured");
    throw new AppError("AI not configured", "CONFIGURATION_ERROR", 500);
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Original action type: ${body.actionType}
Original args: ${JSON.stringify(body.args, null, 2)}
Original summary: ${body.summary}

User's requested changes: "${body.userFeedback}"

Return the revised action as JSON with these fields:
{
  "actionType": "${body.actionType}",
  "args": { ... revised args ... },
  "summary": "... revised one-line summary ..."
}`;

  const result = await Promise.race([
    ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: {
          role: "user",
          parts: [{ text: SYSTEM_PROMPTS.REVISE_ACTION }],
        },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out")), 30_000)
    ),
  ]);

  const responseText = (result.text ?? "").trim();

  // Extract the first balanced JSON object from the response
  let parsed: { actionType: string; args: Record<string, unknown>; summary: string };
  try {
    const firstBrace = responseText.indexOf("{");
    if (firstBrace === -1) throw new Error("No JSON found");
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = firstBrace; i < responseText.length; i++) {
      const ch = responseText[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error("No balanced JSON found");
    parsed = JSON.parse(responseText.slice(firstBrace, end + 1));
  } catch (err) {
    log.error({ responseText, err }, "failed to parse revised action");
    throw new AppError("Could not revise action. Try again.", "AI_ERROR", 500);
  }

  return successResponse({
    actionType: parsed.actionType || body.actionType,
    args: parsed.args || body.args,
    summary: parsed.summary || body.summary,
  });
});

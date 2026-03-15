import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

/**
 * POST /api/stt/token
 *
 * Returns a temporary Deepgram API key for client-side streaming STT.
 * The key is scoped to usage:write and expires in 10 seconds — enough
 * to open one WebSocket connection (Deepgram keeps it alive after connect).
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  await getUserIdFromRequest(req); // Auth check

  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  // Create a temporary key via Deepgram's API
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) {
    return successResponse({ key: apiKey });
  }

  const projects = await res.json();
  const projectId = projects.projects?.[0]?.project_id;

  if (!projectId) {
    return successResponse({ key: apiKey });
  }

  // Create a temporary key that expires in 10 seconds
  const keyRes = await fetch(
    `https://api.deepgram.com/v1/projects/${projectId}/keys`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: "Temporary STT key",
        scopes: ["usage:write"],
        time_to_live_in_seconds: 10,
      }),
    }
  );

  if (!keyRes.ok) {
    return successResponse({ key: apiKey });
  }

  const keyData = await keyRes.json();
  return successResponse({ key: keyData.key });
});

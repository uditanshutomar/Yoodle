import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

/**
 * POST /api/stt/token
 *
 * Returns a temporary Deepgram API key for client-side streaming STT.
 * The key has "member" scope so it can access the /v1/listen endpoint,
 * and expires in 10 seconds — enough to open one WebSocket connection
 * (Deepgram keeps it alive after connect).
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  await getUserIdFromRequest(req); // Auth check

  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  // Create a temporary key via Deepgram's API
  let projectId: string | undefined;
  try {
    const res = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (res.ok) {
      const projects = await res.json();
      projectId = projects.projects?.[0]?.project_id;
    }
  } catch {
    // Fall through to return main key
  }

  if (!projectId) {
    throw new Error(
      "Could not retrieve Deepgram project ID. Temporary key creation requires a valid project."
    );
  }

  // Create a temporary key that expires in 10 seconds
  // "member" scope is required for STT access (/v1/listen)
  try {
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
          scopes: ["member"],
          time_to_live_in_seconds: 10,
        }),
      }
    );

    if (keyRes.ok) {
      const keyData = await keyRes.json();
      if (keyData.key) {
        return successResponse({ key: keyData.key });
      }
    }
  } catch {
    // Fall through to return main key
  }

  // If temporary key creation failed, do NOT fall back to the main API key.
  // The main key has full account access and must never be sent to clients.
  throw new Error(
    "Failed to create temporary Deepgram key. Please check Deepgram API configuration."
  );
});

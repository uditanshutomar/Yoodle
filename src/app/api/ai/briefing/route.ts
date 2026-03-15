import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { buildWorkspaceContext, WorkspaceSnapshot } from "@/lib/google/workspace-context";
import { hasGoogleAccess } from "@/lib/google/client";
import { createLogger } from "@/lib/infra/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts";
import { successResponse, errorResponse } from "@/lib/infra/api/response";

const log = createLogger("api:ai-briefing");

// In-memory cache for snapshot diffing (per-user)
const lastSnapshots = new Map<string, WorkspaceSnapshot>();

function hasSnapshotChanged(
  prev: WorkspaceSnapshot | undefined,
  curr: WorkspaceSnapshot
): boolean {
  if (!prev) return true;
  if (prev.unreadCount !== curr.unreadCount) return true;
  if (prev.nextMeetingId !== curr.nextMeetingId) return true;
  if (prev.overdueTaskCount !== curr.overdueTaskCount) return true;
  if (prev.emailIds.length !== curr.emailIds.length) return true;
  if (prev.emailIds.some((id, i) => curr.emailIds[i] !== id)) return true;
  if (prev.taskIds.length !== curr.taskIds.length) return true;
  if (prev.taskIds.some((id, i) => curr.taskIds[i] !== id)) return true;
  return false;
}

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return successResponse({ briefing: null, reason: "no_google_access" });
  }

  const { contextString, snapshot } = await buildWorkspaceContext(userId);
  if (!contextString) {
    return successResponse({ briefing: null, reason: "no_workspace_data" });
  }

  const prevSnapshot = lastSnapshots.get(userId);
  if (!hasSnapshotChanged(prevSnapshot, snapshot)) {
    return successResponse({ briefing: null, reason: "no_changes" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log.error("GEMINI_API_KEY not configured");
    return errorResponse("CONFIGURATION_ERROR", "AI not configured", 500);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: `Generate a briefing based on this workspace data:\n${contextString}` }],
      },
    ],
    systemInstruction: {
      role: "user",
      parts: [{ text: SYSTEM_PROMPTS.BRIEFING }],
    },
  });

  const briefingText = result.response.text();

  if (briefingText.trim() === "NO_UPDATE") {
    return successResponse({ briefing: null, reason: "no_changes" });
  }

  lastSnapshots.set(userId, snapshot);

  return successResponse({
    briefing: briefingText,
    metadata: {
      unreadCount: snapshot.unreadCount,
      nextMeetingTime: snapshot.nextMeetingTime,
      overdueTaskCount: snapshot.overdueTaskCount,
    },
  });
});

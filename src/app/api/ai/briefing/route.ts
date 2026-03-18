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

// In-memory cache for snapshot diffing (per-user).
// Bounded to 500 entries with LRU eviction to prevent memory leaks.
// Entries expire after 4 hours to prevent permanent NO_UPDATE suppression.
const MAX_SNAPSHOT_CACHE = 500;
const SNAPSHOT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const lastSnapshots = new Map<string, { snapshot: WorkspaceSnapshot; cachedAt: number }>();

function setSnapshot(userId: string, snapshot: WorkspaceSnapshot) {
  // Delete first so re-insertion moves it to the end (true LRU order)
  lastSnapshots.delete(userId);
  // Evict the least-recently-used entry if at capacity
  if (lastSnapshots.size >= MAX_SNAPSHOT_CACHE) {
    const oldest = lastSnapshots.keys().next().value;
    if (oldest) lastSnapshots.delete(oldest);
  }
  lastSnapshots.set(userId, { snapshot, cachedAt: Date.now() });
}

function getSnapshot(userId: string): WorkspaceSnapshot | undefined {
  const entry = lastSnapshots.get(userId);
  if (!entry) return undefined;
  // Expire stale entries so a false NO_UPDATE doesn't permanently suppress briefings
  if (Date.now() - entry.cachedAt > SNAPSHOT_TTL_MS) {
    lastSnapshots.delete(userId);
    return undefined;
  }
  return entry.snapshot;
}

/** Compare nullable numeric fields — treat null→non-null transitions as changes */
function nullableChanged(prev: number | null, curr: number | null): boolean {
  if (prev === null && curr === null) return false;
  return prev !== curr;
}

function hasSnapshotChanged(
  prev: WorkspaceSnapshot | undefined,
  curr: WorkspaceSnapshot
): boolean {
  if (!prev) return true;
  if (prev.unreadCount !== curr.unreadCount) return true;
  if (prev.nextMeetingId !== curr.nextMeetingId) return true;
  // Board tasks
  if (nullableChanged(prev.boardOverdueCount, curr.boardOverdueCount)) return true;
  if (nullableChanged(prev.boardTaskCount, curr.boardTaskCount)) return true;
  // Emails
  if (prev.emailIds === null !== (curr.emailIds === null)) return true;
  if (prev.emailIds !== null && curr.emailIds !== null) {
    if (prev.emailIds.length !== curr.emailIds.length) return true;
    if (prev.emailIds.some((id, i) => curr.emailIds![i] !== id)) return true;
  }
  // Board task IDs
  if (prev.boardTaskIds === null !== (curr.boardTaskIds === null)) return true;
  if (prev.boardTaskIds !== null && curr.boardTaskIds !== null) {
    if (prev.boardTaskIds.length !== curr.boardTaskIds.length) return true;
    if (prev.boardTaskIds.some((id, i) => curr.boardTaskIds![i] !== id)) return true;
  }
  // Meeting actions + conversation threads
  if (nullableChanged(prev.unresolvedMeetingActions, curr.unresolvedMeetingActions)) return true;
  if (nullableChanged(prev.activeConversationThreads, curr.activeConversationThreads)) return true;
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

  const prevSnapshot = getSnapshot(userId);
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
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
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

  // Always update the snapshot cache — prevents repeated Gemini calls
  // when data changed but Gemini says "NO_UPDATE"
  setSnapshot(userId, snapshot);

  if (briefingText.trim() === "NO_UPDATE") {
    return successResponse({ briefing: null, reason: "no_changes" });
  }

  return successResponse({
    briefing: briefingText,
    metadata: {
      unreadCount: snapshot.unreadCount,
      nextMeetingTime: snapshot.nextMeetingTime,
      boardTaskCount: snapshot.boardTaskCount,
      boardOverdueCount: snapshot.boardOverdueCount,
      unresolvedMeetingActions: snapshot.unresolvedMeetingActions,
    },
  });
});

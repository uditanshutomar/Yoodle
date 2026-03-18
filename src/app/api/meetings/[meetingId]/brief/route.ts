import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";

// ── GET /api/meetings/:meetingId/brief ──────────────────────────────

/**
 * Return the existing meeting brief for the authenticated user.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  await connectDB();

  const MeetingBrief = (await import("@/lib/infra/db/models/meeting-brief")).default;
  const brief = await MeetingBrief.findOne({ meetingId, userId }).lean();

  if (!brief) {
    return errorResponse("NOT_FOUND", "No brief found", 404);
  }

  return successResponse(brief);
});

// ── POST /api/meetings/:meetingId/brief ─────────────────────────────

/**
 * Generate a new meeting brief by invoking the prepare_meeting_brief tool.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  await connectDB();

  const { executeWorkspaceTool } = await import("@/lib/ai/tools");
  const result = await executeWorkspaceTool(userId, "prepare_meeting_brief", {
    meetingId,
    createDoc: true,
  });

  if (!result.success) {
    return errorResponse("BRIEF_GENERATION_FAILED", result.summary, 500);
  }

  return successResponse(result.data);
});

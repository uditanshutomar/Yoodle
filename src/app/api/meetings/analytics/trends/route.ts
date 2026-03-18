import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";

// ── Helpers ─────────────────────────────────────────────────────────

const RANGE_TO_DAYS: Record<string, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

// ── GET /api/meetings/analytics/trends ──────────────────────────────

/**
 * Return aggregated meeting analytics trends for the authenticated user.
 * Accepts a `range` query param: week | month | quarter (default: month).
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const range = req.nextUrl.searchParams.get("range") || "month";
  const days = RANGE_TO_DAYS[range] ?? RANGE_TO_DAYS.month;

  const since = new Date();
  since.setDate(since.getDate() - days);

  await connectDB();

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;

  const entries = await MeetingAnalytics.find({
    userId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  // Compute aggregate stats
  const totalMeetings = entries.length;
  const avgScore =
    totalMeetings > 0
      ? Math.round(entries.reduce((sum, e) => sum + (e.meetingScore ?? 0), 0) / totalMeetings)
      : 0;
  const totalDecisions = entries.reduce((sum, e) => sum + (e.decisionCount ?? 0), 0);
  const totalActionItems = entries.reduce((sum, e) => sum + (e.actionItemCount ?? 0), 0);
  const avgDuration =
    totalMeetings > 0
      ? Math.round(entries.reduce((sum, e) => sum + (e.duration ?? 0), 0) / totalMeetings)
      : 0;

  return successResponse({
    range,
    totalMeetings,
    avgScore,
    totalDecisions,
    totalActionItems,
    avgDuration,
    entries,
  });
});

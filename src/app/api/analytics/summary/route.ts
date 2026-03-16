import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import AnalyticsEvent from "@/lib/infra/db/models/analytics-event";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// GET /api/analytics/summary -- admin analytics overview
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  // Only admins may access platform-wide analytics
  const caller = await User.findById(userId).select("role").lean();
  if (!caller || caller.role !== "admin") {
    throw new ForbiddenError("Admin access required.");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [
    totalUsers,
    totalMeetings,
    activeMeetings,
    recentEvents,
    meetingsLast30d,
    meetingsLast7d,
    eventBreakdown,
  ] = await Promise.all([
    User.countDocuments(),
    Meeting.countDocuments(),
    Meeting.countDocuments({ status: "live" }),
    AnalyticsEvent.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    Meeting.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Meeting.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return successResponse({
    overview: {
      totalUsers,
      totalMeetings,
      activeMeetings,
      recentEvents,
    },
    trends: {
      meetingsLast30d,
      meetingsLast7d,
    },
    eventBreakdown: eventBreakdown.map((entry) => ({
      type: entry._id,
      count: entry.count,
    })),
  });
});

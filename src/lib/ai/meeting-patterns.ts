import mongoose from "mongoose";
import { createLogger } from "@/lib/infra/logger";
import connectDB from "@/lib/infra/db/client";

const log = createLogger("meeting-patterns");

export interface PatternInsight {
  type:
    | "duration_drift"
    | "score_trend"
    | "participation_imbalance"
    | "no_agenda_penalty"
    | "overdue_actions";
  message: string;
  severity: "info" | "warning";
}

export async function analyzeMeetingPatterns(
  userId: string,
): Promise<PatternInsight[]> {
  await connectDB();

  const MeetingAnalytics = (await import("@/lib/infra/db/models/meeting-analytics")).default;
  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const analytics = await MeetingAnalytics.find({
    userId: new mongoose.Types.ObjectId(userId),
    createdAt: { $gte: thirtyDaysAgo },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (analytics.length === 0) {
    log.info({ userId }, "No analytics data in last 30 days");
    return [];
  }

  // Load meetings for scheduled duration info
  const meetingIds = analytics.map((a) => a.meetingId);
  const meetings = await Meeting.find(
    { _id: { $in: meetingIds } },
    { _id: 1, scheduledDuration: 1, title: 1 },
  ).lean();

  const meetingMap = new Map(
    meetings.map((m) => [String(m._id), m]),
  );

  const insights: PatternInsight[] = [];

  // Group analytics by meeting title for recurring meeting detection
  const byTitle = new Map<string, typeof analytics>();
  for (const a of analytics) {
    const meeting = meetingMap.get(String(a.meetingId));
    const title = meeting?.title || "Unknown";
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title)!.push(a);
  }

  // 1. Duration drift: avg duration > scheduledDuration by 20%+
  for (const [title, group] of byTitle) {
    if (group.length < 2) continue;

    const meeting = meetingMap.get(String(group[0].meetingId));
    const scheduledMinutes = meeting?.scheduledDuration;
    if (!scheduledMinutes) continue;

    const scheduledSeconds = scheduledMinutes * 60;
    const avgDuration =
      group.reduce((sum, a) => sum + a.duration, 0) / group.length;

    if (avgDuration > scheduledSeconds * 1.2) {
      const overageMinutes = Math.round(
        (avgDuration - scheduledSeconds) / 60,
      );
      insights.push({
        type: "duration_drift",
        message: `"${title}" runs ~${overageMinutes} min over its scheduled ${scheduledMinutes} min slot on average.`,
        severity: "warning",
      });
    }
  }

  // 2. Score trend: last 3 meetings avg score < historical baseline
  if (analytics.length >= 4) {
    const lastThree = analytics.slice(0, 3);
    const historical = analytics.slice(3);
    const historicalAvg =
      historical.reduce((sum, a) => sum + a.meetingScore, 0) / historical.length;
    const recentAvg =
      lastThree.reduce((sum, a) => sum + a.meetingScore, 0) / lastThree.length;

    if (recentAvg < historicalAvg) {
      insights.push({
        type: "score_trend",
        message: `Recent meeting scores (avg ${Math.round(recentAvg)}) are below your historical average (${Math.round(historicalAvg)}).`,
        severity: "warning",
      });
    }
  }

  // 3. Participation imbalance: any speaker with >60% talk time
  for (const a of analytics) {
    for (const speaker of a.speakerStats || []) {
      if (speaker.talkTimePercent > 60) {
        const meeting = meetingMap.get(String(a.meetingId));
        const title = meeting?.title || "a recent meeting";
        insights.push({
          type: "participation_imbalance",
          message: `${speaker.name} had ${Math.round(speaker.talkTimePercent)}% of talk time in "${title}". Consider encouraging more balanced participation.`,
          severity: "info",
        });
        break; // one insight per meeting is enough
      }
    }
  }

  // 4. Overdue actions: actionItemsCompleted / actionItemCount < 50%
  const totalActions = analytics.reduce(
    (sum, a) => sum + (a.actionItemCount || 0),
    0,
  );
  const totalCompleted = analytics.reduce(
    (sum, a) => sum + (a.actionItemsCompleted || 0),
    0,
  );

  if (totalActions > 0 && totalCompleted / totalActions < 0.5) {
    const pct = Math.round((totalCompleted / totalActions) * 100);
    insights.push({
      type: "overdue_actions",
      message: `Only ${pct}% of action items from the last 30 days have been completed. Consider reviewing blockers.`,
      severity: "warning",
    });
  }

  log.info(
    { userId, analyticsCount: analytics.length, insightCount: insights.length },
    "Meeting patterns analyzed",
  );

  return insights;
}

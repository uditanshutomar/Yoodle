import { NextRequest } from "next/server";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("cron:proactive");

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    log.error("CRON_SECRET is not configured — rejecting request");
    return new Response("Server misconfigured", { status: 500 });
  }

  const secret =
    req.headers.get("x-cron-secret") || req.headers.get("authorization");
  if (secret !== `Bearer ${cronSecret}` && secret !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const {
      triggerMeetingPrep,
      triggerDeadlineReminders,
      triggerFollowUpNudges,
      triggerBlockedTaskAlerts,
      triggerStaleTasks,
      triggerWeeklyPatternSummary,
      triggerUnreadHighlights,
      triggerScheduledActions,
      triggerPostMeetingCascade,
    } = await import("@/lib/chat/proactive-triggers");

    const results = await Promise.allSettled([
      triggerMeetingPrep(),
      triggerDeadlineReminders(),
      triggerFollowUpNudges(),
      triggerBlockedTaskAlerts(),
      triggerStaleTasks(),
      triggerWeeklyPatternSummary(),
      triggerUnreadHighlights(),
      triggerScheduledActions(),
      triggerPostMeetingCascade(),
    ]);

    const names = [
      "meetingPrep",
      "deadlineReminders",
      "followUpNudges",
      "blockedTaskAlerts",
      "staleTasks",
      "weeklyPatternSummary",
      "unreadHighlights",
      "scheduledActions",
      "postMeetingCascade",
    ] as const;

    const summary = results.map((r, i) => ({
      trigger: names[i],
      status: r.status,
    }));

    log.info({ summary }, "Proactive triggers completed");
    return Response.json({ ok: true, summary });
  } catch (err) {
    log.error({ err }, "Proactive cron failed");
    return Response.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

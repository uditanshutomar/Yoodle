import { NextRequest } from "next/server";
import { timingSafeEqual, createHmac } from "crypto";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("cron:proactive");

/** Constant-time string comparison to prevent timing attacks on secret values.
 *  Uses HMAC to normalize both inputs to the same length before comparing,
 *  preventing length leakage via early return. */
function safeCompare(a: string, b: string): boolean {
  const hmacKey = "yoodle-safe-compare";
  const ha = createHmac("sha256", hmacKey).update(a).digest();
  const hb = createHmac("sha256", hmacKey).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    log.error("CRON_SECRET is not configured — rejecting request");
    return new Response("Server misconfigured", { status: 500 });
  }

  const xSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const expectedBearer = `Bearer ${cronSecret}`;
  const isValid =
    safeCompare(xSecret, cronSecret) ||
    safeCompare(authHeader, expectedBearer);
  if (!isValid) {
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
      ...(r.status === "rejected" && {
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      }),
    }));

    // Log individual failures at error level for alerting
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        log.error({ err: r.reason, trigger: names[i] }, "proactive trigger failed");
      }
    });

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

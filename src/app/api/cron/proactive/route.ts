import { NextRequest } from "next/server";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("cron:proactive");

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") || req.headers.get("authorization");
  if (
    secret !== `Bearer ${process.env.CRON_SECRET}` &&
    secret !== process.env.CRON_SECRET
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const {
      triggerMeetingPrep,
      triggerDeadlineReminders,
      triggerFollowUpNudges,
      triggerBlockedTaskAlerts,
    } = await import("@/lib/chat/proactive-triggers");

    const results = await Promise.allSettled([
      triggerMeetingPrep(),
      triggerDeadlineReminders(),
      triggerFollowUpNudges(),
      triggerBlockedTaskAlerts(),
    ]);

    const names = [
      "meetingPrep",
      "deadlineReminders",
      "followUpNudges",
      "blockedTaskAlerts",
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

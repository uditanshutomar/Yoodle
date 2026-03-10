import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:usage-aggregate");

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Aggregate usage statistics hourly.
 * Counts participant-minutes per user and writes to the Usage model
 * for the current billing period (YYYY-MM).
 */
export async function usageAggregateProcessor(job: Job): Promise<void> {
  log.info({ jobId: job.id }, "Running usage aggregation");

  const { default: connectDB } = await import("@/lib/db/client");
  const { default: Meeting } = await import("@/lib/db/models/meeting");
  const { default: Usage } = await import("@/lib/db/models/usage");

  await connectDB();

  const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

  // Current billing period (YYYY-MM)
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const recentMeetings = await Meeting.find({
    status: "ended",
    endedAt: { $gte: oneHourAgo },
  }).select("hostId participants startedAt endedAt");

  // Track per-user participant minutes
  const userMinutes = new Map<string, number>();

  for (const meeting of recentMeetings) {
    if (!meeting.startedAt || !meeting.endedAt) continue;

    for (const participant of meeting.participants) {
      if (participant.status !== "joined" || !participant.joinedAt) continue;

      const joinTime = participant.joinedAt.getTime();
      const leaveTime = (participant.leftAt || meeting.endedAt).getTime();
      const minutes = Math.ceil((leaveTime - joinTime) / ONE_MINUTE_MS);
      const validMinutes = Math.max(0, minutes);

      if (validMinutes > 0) {
        const odUserId = participant.userId.toString();
        userMinutes.set(odUserId, (userMinutes.get(odUserId) || 0) + validMinutes);
      }
    }
  }

  // Write per-user usage to the Usage model
  let usersUpdated = 0;
  let totalMinutes = 0;

  for (const [userId, minutes] of userMinutes) {
    totalMinutes += minutes;

    await Usage.findOneAndUpdate(
      { userId, period },
      {
        $inc: { participantMinutes: minutes },
        $set: { lastUpdatedAt: new Date() },
      },
      { upsert: true },
    );

    usersUpdated++;
  }

  log.info(
    {
      meetingsProcessed: recentMeetings.length,
      usersUpdated,
      totalMinutes,
      period,
    },
    "Usage aggregation complete",
  );
}

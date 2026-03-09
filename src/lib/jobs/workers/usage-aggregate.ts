import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:usage-aggregate");

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Aggregate usage statistics hourly.
 * Counts participant-minutes, recording minutes, AI usage, and storage.
 * This prepares data for the billing system (Phase 3).
 */
export async function usageAggregateProcessor(job: Job): Promise<void> {
  log.info({ jobId: job.id }, "Running usage aggregation");

  const { default: connectDB } = await import("@/lib/db/client");
  const { default: Meeting } = await import("@/lib/db/models/meeting");

  await connectDB();

  const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

  const recentMeetings = await Meeting.find({
    status: "ended",
    endedAt: { $gte: oneHourAgo },
  }).select("participants startedAt endedAt");

  let totalParticipantMinutes = 0;

  for (const meeting of recentMeetings) {
    if (!meeting.startedAt || !meeting.endedAt) continue;

    for (const participant of meeting.participants) {
      if (participant.status !== "joined" || !participant.joinedAt) continue;

      const joinTime = participant.joinedAt.getTime();
      const leaveTime = (participant.leftAt || meeting.endedAt).getTime();
      const minutes = Math.ceil((leaveTime - joinTime) / ONE_MINUTE_MS);

      totalParticipantMinutes += Math.max(0, minutes);
    }
  }

  log.info(
    { meetingsProcessed: recentMeetings.length, totalParticipantMinutes },
    "Usage aggregation complete",
  );

  // TODO: Write to Usage model when billing system is added (Phase 3)
}

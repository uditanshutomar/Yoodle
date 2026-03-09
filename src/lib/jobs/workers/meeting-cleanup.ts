import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:meeting-cleanup");

const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Clean up stale meetings that have been "live" for too long
 * without any active participants. Runs every 5 minutes.
 */
export async function meetingCleanupProcessor(job: Job): Promise<void> {
  log.info({ jobId: job.id }, "Running meeting cleanup");

  const { default: connectDB } = await import("@/lib/db/client");
  const { default: Meeting } = await import("@/lib/db/models/meeting");

  await connectDB();

  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  const filter = { status: "live", startedAt: { $lt: staleThreshold } };

  const staleMeetings = await Meeting.find(filter);

  if (staleMeetings.length === 0) {
    log.info("No stale meetings found");
    return;
  }

  const result = await Meeting.updateMany(filter, {
    $set: { status: "ended", endedAt: new Date() },
  });

  log.info({ count: result.modifiedCount }, "Cleaned up stale meetings");
}

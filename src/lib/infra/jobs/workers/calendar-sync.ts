import { type Job, UnrecoverableError } from "bullmq";
import type { CalendarSyncPayload } from "../types";
import { deleteEvent } from "@/lib/google/calendar";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("worker:calendar-sync");

/**
 * Calendar sync processor.
 *
 * Handles durable calendar operations that were previously fire-and-forget.
 * Currently supports:
 * - "delete": Remove a calendar event (meeting cancellation cleanup)
 *
 * Idempotent: deleting an already-deleted event (404/410) is treated as success.
 */
export async function processCalendarSync(
  job: Job<CalendarSyncPayload>,
): Promise<void> {
  const { action, userId, calendarEventId, meetingId } = job.data;
  const jobLog = log.child({ meetingId, calendarEventId, action, jobId: job.id });

  switch (action) {
    case "delete": {
      jobLog.info("deleting calendar event");
      try {
        await deleteEvent(userId, calendarEventId);
        jobLog.info("calendar event deleted successfully");
      } catch (err) {
        // Google API errors expose HTTP status as `.code` (number), `.status`,
        // or `.response.status` depending on the error wrapper. Check all three.
        const status =
          (err as { code?: number }).code ??
          (err as { status?: number }).status ??
          (err as { response?: { status?: number } }).response?.status;

        if (status === 404 || status === 410) {
          jobLog.info("calendar event already deleted (404/410), treating as success");
          return;
        }

        // Non-transient errors: don't waste retries on errors that will never succeed
        if (status === 401 || status === 403) {
          jobLog.error({ err, status }, "non-retryable auth error, giving up");
          throw new UnrecoverableError(
            `Calendar delete failed with status ${status} (non-retryable)`,
          );
        }

        // Transient errors — re-throw to let BullMQ retry
        jobLog.error({ err }, "failed to delete calendar event, will retry");
        throw err;
      }
      break;
    }
    default:
      jobLog.error({ action }, "unknown calendar sync action");
  }
}

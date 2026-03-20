import { Worker } from "bullmq";
import { getConnection } from "./connection";
import { QUEUE_NAMES, closeAllQueues } from "./queue";
import { processPostMeetingCascade } from "./workers/post-meeting-cascade";
import { processCalendarSync } from "./workers/calendar-sync";
import { processRecording } from "./workers/recording-process";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("jobs:workers");

// ── Worker Registry ─────────────────────────────────────────────────

const workers: Worker[] = [];
let started = false;

/**
 * Attach common event listeners to a worker:
 * - `error`: prevents uncaught exception on Redis connection loss
 * - `stalled`: visibility into jobs that exceeded their lock timeout
 */
function attachCommonListeners(worker: Worker, label: string): void {
  worker.on("error", (err) => {
    // Without this handler, ioredis connection errors become uncaught
    // exceptions and crash the entire Next.js process.
    log.error({ err, worker: label }, "worker connection error");
  });

  worker.on("stalled", (jobId) => {
    log.warn({ jobId, worker: label }, "job stalled — will be retried by BullMQ");
  });
}

/**
 * Start all BullMQ workers. Call once during server boot
 * (via `instrumentation.ts` → `register()`).
 *
 * Workers run in-process alongside the Next.js server.
 * Each worker creates its own Redis connection via BullMQ's ioredis client.
 */
export function startWorkers(): void {
  if (started) {
    log.warn("workers already started, skipping duplicate call");
    return;
  }
  started = true;

  const connection = getConnection();

  // ── Post-Meeting Cascade Worker ───────────────────────────────────

  const cascadeWorker = new Worker(
    QUEUE_NAMES.POST_MEETING_CASCADE,
    processPostMeetingCascade,
    {
      connection,
      concurrency: 3,
    },
  );

  cascadeWorker.on("completed", (job) => {
    log.info(
      { jobId: job.id, meetingId: job.data.meetingId },
      "post-meeting cascade completed",
    );
  });

  cascadeWorker.on("failed", (job, err) => {
    log.error(
      { jobId: job?.id, meetingId: job?.data?.meetingId, err },
      "post-meeting cascade failed",
    );
  });

  attachCommonListeners(cascadeWorker, "post-meeting-cascade");
  workers.push(cascadeWorker);

  // ── Calendar Sync Worker ──────────────────────────────────────────

  const calendarWorker = new Worker(
    QUEUE_NAMES.CALENDAR_SYNC,
    processCalendarSync,
    {
      connection,
      concurrency: 5,
    },
  );

  calendarWorker.on("completed", (job) => {
    log.info(
      { jobId: job.id, action: job.data.action, meetingId: job.data.meetingId },
      "calendar sync completed",
    );
  });

  calendarWorker.on("failed", (job, err) => {
    log.error(
      { jobId: job?.id, action: job?.data?.action, meetingId: job?.data?.meetingId, err },
      "calendar sync failed",
    );
  });

  attachCommonListeners(calendarWorker, "calendar-sync");
  workers.push(calendarWorker);

  // ── Recording Process Worker ────────────────────────────────────

  const recordingWorker = new Worker(
    QUEUE_NAMES.RECORDING_PROCESS,
    processRecording,
    {
      connection,
      concurrency: 2,
    },
  );

  recordingWorker.on("completed", (job) => {
    log.info(
      { jobId: job.id, meetingId: job.data.meetingId },
      "recording process completed",
    );
  });

  recordingWorker.on("failed", (job, err) => {
    log.error(
      { jobId: job?.id, meetingId: job?.data?.meetingId, err },
      "recording process failed",
    );
  });

  attachCommonListeners(recordingWorker, "recording-process");
  workers.push(recordingWorker);

  // ── Graceful shutdown on process signals ────────────────────────────
  // Do NOT call process.exit() — Next.js registers its own SIGTERM handler
  // to drain HTTP connections. We just close our workers and queues so Redis
  // connections are released cleanly, then let Next.js handle the exit.

  const shutdown = async (signal: string) => {
    log.info({ signal }, "received shutdown signal, closing workers and queues");
    await closeAllWorkers();
    await closeAllQueues();
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  log.info(
    { workerCount: workers.length },
    "BullMQ workers started",
  );
}

/**
 * Gracefully shut down all workers. Call during `SIGTERM`/`SIGINT`
 * alongside `closeAllQueues()`.
 */
export async function closeAllWorkers(): Promise<void> {
  const results = await Promise.allSettled(
    workers.map((w) => w.close()),
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      log.error(
        { err: (results[i] as PromiseRejectedResult).reason },
        "failed to close worker during shutdown",
      );
    }
  }

  workers.length = 0;
  log.info("all workers shut down");
}

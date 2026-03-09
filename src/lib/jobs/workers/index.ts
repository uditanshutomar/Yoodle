import { createWorker, QUEUE_NAMES } from "../queue";
import { meetingCleanupProcessor } from "./meeting-cleanup";
import { recordingProcessProcessor } from "./recording-process";
import { usageAggregateProcessor } from "./usage-aggregate";
import { tokenRefreshProcessor } from "./token-refresh";
import { vmLifecycleProcessor } from "./vm-lifecycle";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:workers");

/**
 * Initialize all BullMQ workers.
 * Call once on server startup.
 */
export function initializeWorkers(): void {
  createWorker(QUEUE_NAMES.MEETING_CLEANUP, meetingCleanupProcessor);
  createWorker(QUEUE_NAMES.RECORDING_PROCESS, recordingProcessProcessor);
  createWorker(QUEUE_NAMES.USAGE_AGGREGATE, usageAggregateProcessor);
  createWorker(QUEUE_NAMES.TOKEN_REFRESH, tokenRefreshProcessor);
  createWorker(QUEUE_NAMES.VM_LIFECYCLE, vmLifecycleProcessor, {
    concurrency: 2,
  });

  log.info("All workers initialized");
}

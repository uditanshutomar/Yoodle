import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:vm-lifecycle");

const IDLE_BANDWIDTH_THRESHOLD = 1_000_000; // 1 MB

/**
 * Monitor VM instances and auto-shutdown idle ones.
 * Runs every 15 minutes. Uses the ComputeProvider interface.
 */
export async function vmLifecycleProcessor(job: Job): Promise<void> {
  log.info({ jobId: job.id }, "Running VM lifecycle check");

  const { getComputeProvider } = await import("@/lib/providers/compute");
  const provider = await getComputeProvider();

  const instances = await provider.listInstances();
  const activeInstances = instances.filter(
    (i) => i.status === "active" || i.status === "running",
  );

  if (activeInstances.length === 0) {
    log.info("No active VM instances");
    return;
  }

  log.info({ count: activeInstances.length }, "Checking active VM instances");

  let stopped = 0;

  for (const instance of activeInstances) {
    try {
      if (!provider.getBandwidth) continue;

      const bandwidth = await provider.getBandwidth(instance.id);
      const totalRecentBytes = bandwidth.incomingBytes + bandwidth.outgoingBytes;

      if (totalRecentBytes < IDLE_BANDWIDTH_THRESHOLD) {
        log.info(
          { instanceId: instance.id, label: instance.label },
          "Stopping idle VM",
        );
        await provider.stopInstance(instance.id);
        stopped++;
      }
    } catch (error) {
      log.error(
        { instanceId: instance.id, err: error },
        "Failed to check/stop VM",
      );
    }
  }

  log.info(
    { checked: activeInstances.length, stopped },
    "VM lifecycle check complete",
  );
}

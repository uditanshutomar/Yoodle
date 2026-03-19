import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Validate environment variables on server startup
    const { validateEnvOnStartup } = await import("@/lib/infra/env");
    validateEnvOnStartup();

    // Start BullMQ workers for durable job processing
    try {
      const { startWorkers } = await import("@/lib/infra/jobs/start-workers");
      startWorkers();
    } catch (err) {
      // Workers require Redis — log and continue if unavailable
      console.warn("[instrumentation] Failed to start BullMQ workers:", err);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;

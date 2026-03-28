import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Validate environment variables on server startup
    const { validateEnvOnStartup } = await import("@/lib/infra/env");
    validateEnvOnStartup();

    // Start BullMQ workers for durable job processing.
    // On Vercel serverless, skip workers — they create Redis connections on
    // every cold start and compete across instances. Run workers only in
    // long-lived environments (self-hosted, Docker, or dedicated worker process).
    const isVercel = !!process.env.VERCEL;
    const forceWorkers = process.env.ENABLE_BULLMQ_WORKERS === "true";
    if (!isVercel || forceWorkers) {
      try {
        const { startWorkers } = await import("@/lib/infra/jobs/start-workers");
        startWorkers();
      } catch (err) {
        // Workers require Redis — log and continue if unavailable
        console.warn("[instrumentation] Failed to start BullMQ workers:", err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;

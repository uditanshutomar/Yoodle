import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:token-refresh");

const EXPIRY_BUFFER_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Proactively refresh Google OAuth tokens that are about to expire.
 * Runs every 6 hours to ensure workspace API access stays active.
 */
export async function tokenRefreshProcessor(job: Job): Promise<void> {
  log.info({ jobId: job.id }, "Running token refresh check");

  const { default: connectDB } = await import("@/lib/db/client");
  const { default: User } = await import("@/lib/db/models/user");

  await connectDB();

  const expiryThreshold = new Date(Date.now() + EXPIRY_BUFFER_MS);

  const usersNeedingRefresh = await User.find({
    "googleTokens.expiresAt": { $lt: expiryThreshold },
    "googleTokens.refreshToken": { $exists: true, $ne: "" },
  }).select("email googleTokens");

  if (usersNeedingRefresh.length === 0) {
    log.info("No tokens need refreshing");
    return;
  }

  log.info(
    { count: usersNeedingRefresh.length },
    "Found users with expiring Google tokens",
  );

  let refreshed = 0;
  let failed = 0;

  for (const user of usersNeedingRefresh) {
    if (!user.googleTokens?.refreshToken) continue;

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          grant_type: "refresh_token",
          refresh_token: user.googleTokens.refreshToken,
        }),
      });

      if (!response.ok) {
        log.warn(
          { userId: user._id.toString(), status: response.status },
          "Google token refresh failed",
        );
        failed++;
        continue;
      }

      const data = await response.json();

      await User.findByIdAndUpdate(user._id, {
        "googleTokens.accessToken": data.access_token,
        "googleTokens.expiresAt": new Date(
          Date.now() + (data.expires_in || 3600) * 1000,
        ),
        ...(data.refresh_token
          ? { "googleTokens.refreshToken": data.refresh_token }
          : {}),
      });

      refreshed++;
    } catch (error) {
      log.error(
        { userId: user._id.toString(), err: error },
        "Failed to refresh Google token for user",
      );
      failed++;
    }
  }

  log.info({ refreshed, failed }, "Token refresh complete");
}

import { google } from "googleapis";
import { createAuthenticatedClient } from "@/lib/infra/auth/google";
import connectDB from "@/lib/infra/db/client";
import User, { IUserDocument } from "@/lib/infra/db/models/user";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("google:client");

/**
 * Get an authenticated Google OAuth2 client for a user.
 * Automatically refreshes expired tokens and saves the new ones to the DB.
 */
export async function getGoogleClientForUser(userId: string) {
  await connectDB();

  const user = await User.findById(userId).select("googleTokens");
  if (!user?.googleTokens) {
    throw new Error("User has no Google tokens. Re-authentication required.");
  }

  const client = createAuthenticatedClient({
    accessToken: user.googleTokens.accessToken,
    refreshToken: user.googleTokens.refreshToken,
    expiresAt: user.googleTokens.expiresAt,
  });

  // Listen for token refresh events and persist new tokens
  client.on("tokens", async (newTokens) => {
    try {
      const update: Record<string, unknown> = {};

      if (newTokens.access_token) {
        update["googleTokens.accessToken"] = newTokens.access_token;
      }
      if (newTokens.expiry_date) {
        update["googleTokens.expiresAt"] = new Date(newTokens.expiry_date);
      }
      if (newTokens.refresh_token) {
        update["googleTokens.refreshToken"] = newTokens.refresh_token;
      }

      if (Object.keys(update).length > 0) {
        await User.findByIdAndUpdate(userId, { $set: update });
      }
    } catch (err) {
      // Log but don't throw — the current request can still proceed with the
      // in-memory refreshed token; the next request will trigger another refresh.
      log.error({ err }, "failed to persist refreshed Google tokens");
    }
  });

  return client;
}

/**
 * Check if a user has valid Google Workspace tokens.
 */
export async function hasGoogleAccess(userId: string): Promise<boolean> {
  await connectDB();
  const user = await User.findById(userId).select("googleTokens").lean() as IUserDocument | null;
  return !!(user?.googleTokens?.refreshToken);
}

/**
 * Get authenticated Google API service instances for a user.
 */
export async function getGoogleServices(userId: string) {
  const auth = await getGoogleClientForUser(userId);

  return {
    gmail: google.gmail({ version: "v1", auth }),
    calendar: google.calendar({ version: "v3", auth }),
    drive: google.drive({ version: "v3", auth }),
    docs: google.docs({ version: "v1", auth }),
    sheets: google.sheets({ version: "v4", auth }),
    slides: google.slides({ version: "v1", auth }),
    tasks: google.tasks({ version: "v1", auth }),
    people: google.people({ version: "v1", auth }),
  };
}

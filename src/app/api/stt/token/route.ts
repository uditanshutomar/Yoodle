import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { decrypt } from "@/lib/infra/crypto/encryption";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:stt-token");

/**
 * POST /api/stt/token
 *
 * Returns a Deepgram API key for client-side streaming STT.
 *
 * Resolution order:
 * 1. User's BYOK Deepgram key (from Settings → API Keys)
 * 2. Platform Deepgram key (DEEPGRAM_API_KEY env var)
 * 3. Error if neither is available
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  // 1. Check user's stored BYOK key
  try {
    await connectDB();
    const user = await User.findById(userId).select("apiKeys.deepgram").lean();
    if (user?.apiKeys?.deepgram) {
      const userKey = decrypt(user.apiKeys.deepgram);
      if (userKey) {
        return successResponse({ key: userKey, source: "user" });
      }
    }
  } catch (err) {
    log.warn({ err, userId }, "Failed to read user Deepgram key, trying platform key");
  }

  // 2. Fall back to platform key
  const platformKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (platformKey) {
    return successResponse({ key: platformKey, source: "platform" });
  }

  // 3. No key available
  throw new Error(
    "No Deepgram API key available. Add your key in Settings → API Keys."
  );
});

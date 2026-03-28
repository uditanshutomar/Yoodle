import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { encrypt, decrypt, maskApiKey } from "@/lib/infra/crypto/encryption";
import { invalidateCache } from "@/lib/infra/redis/cache";

const VALID_PROVIDERS = ["gemini", "deepgram"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

// ── Schemas ───────────────────────────────────────────────────────────

const saveKeysSchema = z.object({
  gemini: z.string().trim().min(1).max(500).optional(),
  deepgram: z.string().trim().min(1).max(500).optional(),
}).refine((data) => data.gemini || data.deepgram, {
  message: "At least one API key must be provided.",
});

const deleteKeySchema = z.object({
  provider: z.enum(VALID_PROVIDERS),
});

// ── GET /api/users/me/api-keys ────────────────────────────────────────
// Returns which keys are configured (masked preview, never full key)

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const user = await User.findById(userId).select("apiKeys").lean();
  if (!user) throw new NotFoundError("User not found.");

  const keys: Record<string, { configured: boolean; preview?: string }> = {};

  for (const provider of VALID_PROVIDERS) {
    const encryptedValue = user.apiKeys?.[provider];
    if (encryptedValue) {
      try {
        const decrypted = decrypt(encryptedValue);
        keys[provider] = { configured: true, preview: maskApiKey(decrypted) };
      } catch {
        // Corrupted value — treat as not configured
        keys[provider] = { configured: false };
      }
    } else {
      keys[provider] = { configured: false };
    }
  }

  return successResponse({ keys });
});

// ── PATCH /api/users/me/api-keys ──────────────────────────────────────
// Save one or both API keys (encrypted at rest)

export const PATCH = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = await req.json();
  const data = saveKeysSchema.parse(body);

  await connectDB();

  const updateFields: Record<string, string> = {};

  if (data.gemini) {
    updateFields["apiKeys.gemini"] = encrypt(data.gemini);
  }
  if (data.deepgram) {
    updateFields["apiKeys.deepgram"] = encrypt(data.deepgram);
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true, runValidators: true },
  ).select("apiKeys");

  if (!updated) throw new NotFoundError("User not found.");

  await invalidateCache(`user:profile:${userId}`);

  // Return masked previews
  const result: Record<string, { configured: boolean; preview?: string }> = {};
  for (const provider of VALID_PROVIDERS) {
    const enc = updated.apiKeys?.[provider];
    if (enc) {
      try {
        result[provider] = { configured: true, preview: maskApiKey(decrypt(enc)) };
      } catch {
        result[provider] = { configured: false };
      }
    } else {
      result[provider] = { configured: false };
    }
  }

  return successResponse({ keys: result });
});

// ── DELETE /api/users/me/api-keys ─────────────────────────────────────
// Remove a specific API key

export const DELETE = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = await req.json();
  const { provider } = deleteKeySchema.parse(body);

  await connectDB();

  const updated = await User.findByIdAndUpdate(
    userId,
    { $unset: { [`apiKeys.${provider}`]: 1 } },
    { new: true },
  ).select("apiKeys");

  if (!updated) throw new NotFoundError("User not found.");

  await invalidateCache(`user:profile:${userId}`);

  return successResponse({ message: `${provider} API key removed.` });
});

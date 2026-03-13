import mongoose from "mongoose";
import connectDB from "@/lib/db/client";
import Usage, { type IUsage } from "@/lib/db/models/usage";

const FREE_TIER_LIMITS = {
  participantMinutes: 10_000,
  aiMinutes: 100,
  storageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
} as const;

/** Get current period string like "2026-03". */
export function getCurrentPeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

/** Atomically increment a usage field for the current period. */
async function incrementUsageField(
  userId: string,
  field: keyof Pick<
    IUsage,
    | "participantMinutes"
    | "recordingMinutes"
    | "aiMinutes"
    | "storageBytes"
    | "livekitMinutes"
  >,
  amount: number,
): Promise<void> {
  await connectDB();

  await Usage.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(userId),
      period: getCurrentPeriod(),
    },
    {
      $inc: { [field]: amount },
      $set: { lastUpdatedAt: new Date() },
    },
    { upsert: true },
  );
}

/** Increment participant-minutes for a user. All minutes are LiveKit minutes. */
export async function trackParticipantMinutes(
  userId: string,
  minutes: number,
): Promise<void> {
  await connectDB();

  await Usage.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(userId),
      period: getCurrentPeriod(),
    },
    {
      $inc: { participantMinutes: minutes, livekitMinutes: minutes },
      $set: { lastUpdatedAt: new Date() },
    },
    { upsert: true },
  );
}

/** Increment AI usage minutes. */
export async function trackAIUsage(
  userId: string,
  minutes: number,
): Promise<void> {
  await incrementUsageField(userId, "aiMinutes", minutes);
}

/** Increment recording minutes. */
export async function trackRecordingMinutes(
  userId: string,
  minutes: number,
): Promise<void> {
  await incrementUsageField(userId, "recordingMinutes", minutes);
}

/** Increment storage bytes. */
export async function trackStorageUsage(
  userId: string,
  bytes: number,
): Promise<void> {
  await incrementUsageField(userId, "storageBytes", bytes);
}

/** Get usage for the current period. */
export async function getCurrentUsage(
  userId: string,
): Promise<IUsage | null> {
  await connectDB();

  const usage = await Usage.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    period: getCurrentPeriod(),
  }).lean<IUsage>();

  return usage;
}

/** Check if user is within free tier limits. */
export async function checkFreeTierLimits(userId: string): Promise<{
  withinLimits: boolean;
  usage: IUsage | null;
  limits: typeof FREE_TIER_LIMITS;
}> {
  const usage = await getCurrentUsage(userId);

  if (!usage) {
    return { withinLimits: true, usage: null, limits: FREE_TIER_LIMITS };
  }

  const withinLimits =
    usage.participantMinutes <= FREE_TIER_LIMITS.participantMinutes &&
    usage.aiMinutes <= FREE_TIER_LIMITS.aiMinutes &&
    usage.storageBytes <= FREE_TIER_LIMITS.storageBytes;

  return { withinLimits, usage, limits: FREE_TIER_LIMITS };
}

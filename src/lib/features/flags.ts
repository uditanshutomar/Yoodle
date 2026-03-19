/**
 * Yoodle Feature Flags
 *
 * Controls which features are available based on the edition (community vs cloud).
 * Community edition is free, self-hostable, MIT-licensed.
 * Cloud edition adds managed infrastructure and premium features.
 *
 * Set via YOODLE_EDITION env var: "community" (default) | "cloud"
 */

type YoodleEdition = "community" | "cloud";

const VALID_EDITIONS: ReadonlySet<string> = new Set(["community", "cloud"]);
const rawEdition = process.env.YOODLE_EDITION || "community";
if (!VALID_EDITIONS.has(rawEdition)) {
  throw new Error(
    `Invalid YOODLE_EDITION="${rawEdition}". Must be "community" or "cloud".`,
  );
}
const EDITION = rawEdition as YoodleEdition;
const isCloud = EDITION === "cloud";

export const features = {
  /** Current edition */
  edition: EDITION,

  /** Whether this is the cloud (SaaS) edition */
  isCloud,

  /** Whether this is the self-hosted community edition */
  isCommunity: !isCloud,

  /** Usage-based billing via Stripe */
  usageBilling: isCloud,

  /** Server-side recording via LiveKit Egress — available to all */
  serverSideRecording: true,

  /** Managed LiveKit (cloud provides hosted SFU) */
  livekitCloud: isCloud,

  /** Maximum participants per room */
  maxParticipantsPerRoom: isCloud ? 100 : 25,

  /** AI-powered live captions (counts against AI minutes) */
  liveCaptions: isCloud,

  /** Custom branding (logos, colors) */
  customBranding: isCloud,

  /** Advanced analytics dashboard */
  advancedAnalytics: isCloud,

  /** Admin dashboard — available to all */
  adminDashboard: true,

  /** AI assistant — available to all (bring your own API key for community) */
  aiAssistant: true,

  /** Ghost rooms — available to all */
  ghostRooms: true,

  /** Shared workspaces — available to all */
  sharedWorkspaces: true,

  /** Max meeting duration in minutes (0 = unlimited) */
  maxMeetingDurationMinutes: 0,

  /** Free tier participant-minutes per month (cloud only, 0 = unlimited) */
  freeParticipantMinutes: isCloud ? 10_000 : 0,
} as const;

/** Get the current edition display name */
export function getEditionName(): string {
  return isCloud ? "Yoodle Cloud" : "Yoodle Community";
}

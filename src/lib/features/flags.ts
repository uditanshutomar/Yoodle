/**
 * Yoodle Feature Flags
 *
 * Controls which features are available based on the edition (community vs cloud).
 * Community edition is free, self-hostable, MIT-licensed.
 * Cloud edition adds managed infrastructure and premium features.
 *
 * Set via YOODLE_EDITION env var: "community" (default) | "cloud"
 */

export type YoodleEdition = "community" | "cloud";

const EDITION: YoodleEdition = (process.env.YOODLE_EDITION as YoodleEdition) || "community";

export const features = {
  /** Current edition */
  edition: EDITION,

  /** Whether this is the cloud (SaaS) edition */
  isCloud: EDITION === "cloud",

  /** Whether this is the self-hosted community edition */
  isCommunity: EDITION === "community",

  /** Usage-based billing via Stripe */
  usageBilling: EDITION === "cloud",

  /** Server-side recording via LiveKit Egress — available to all */
  serverSideRecording: true,

  /** Managed LiveKit (cloud provides hosted SFU) */
  livekitCloud: EDITION === "cloud",

  /** Maximum participants per room */
  maxParticipantsPerRoom: EDITION === "cloud" ? 100 : 25,

  /** AI-powered live captions (counts against AI minutes) */
  liveCaptions: EDITION === "cloud",

  /** Custom branding (logos, colors) */
  customBranding: EDITION === "cloud",

  /** Advanced analytics dashboard */
  advancedAnalytics: EDITION === "cloud",

  /** Admin dashboard — available to all */
  adminDashboard: true,

  /** AI assistant — available to all (bring your own API key for community) */
  aiAssistant: true,

  /** Ghost rooms — available to all */
  ghostRooms: true,

  /** Shared workspaces — available to all */
  sharedWorkspaces: true,

  /** Max meeting duration in minutes (0 = unlimited) */
  maxMeetingDurationMinutes: EDITION === "cloud" ? 0 : 0,

  /** Free tier participant-minutes per month (cloud only, 0 = unlimited) */
  freeParticipantMinutes: EDITION === "cloud" ? 10_000 : 0,
} as const;

/** Check if a premium feature is available */
export function isFeatureEnabled(feature: keyof typeof features): boolean {
  return Boolean(features[feature]);
}

/** Get the current edition display name */
export function getEditionName(): string {
  return EDITION === "cloud" ? "Yoodle Cloud" : "Yoodle Community";
}

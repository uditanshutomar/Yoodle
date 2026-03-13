/**
 * LiveKit server configuration.
 *
 * Env vars:
 *   LIVEKIT_URL          — ws(s) URL of the LiveKit server (e.g. ws://localhost:7880)
 *   LIVEKIT_API_KEY      — API key for server-side token generation
 *   LIVEKIT_API_SECRET   — API secret for server-side token generation
 */

export const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
export const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
export const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

/**
 * Public-facing LiveKit URL for client connections.
 * Falls back to LIVEKIT_URL if not explicitly set.
 */
export const LIVEKIT_PUBLIC_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || LIVEKIT_URL;

/** Returns true when all three LiveKit env vars are configured. */
export function isLiveKitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

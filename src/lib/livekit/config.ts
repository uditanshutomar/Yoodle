/**
 * LiveKit server configuration.
 *
 * Secrets are accessed through getter functions rather than module-level
 * constants to avoid accidental import in client-side bundles and to
 * throw eagerly when env vars are missing in production.
 *
 * Env vars:
 *   LIVEKIT_URL          — ws(s) URL of the LiveKit server (e.g. ws://localhost:7880)
 *   LIVEKIT_API_KEY      — API key for server-side token generation
 *   LIVEKIT_API_SECRET   — API secret for server-side token generation
 */

export function getLiveKitUrl(): string {
  const url = process.env.LIVEKIT_URL;
  if (!url) {
    throw new Error("LIVEKIT_URL is not set.");
  }
  return url;
}

export function getLiveKitApiKey(): string {
  const key = process.env.LIVEKIT_API_KEY;
  if (!key) {
    throw new Error("LIVEKIT_API_KEY is not set.");
  }
  return key;
}

export function getLiveKitApiSecret(): string {
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!secret) {
    throw new Error("LIVEKIT_API_SECRET is not set.");
  }
  return secret;
}

/**
 * Public-facing LiveKit URL for client connections.
 * Falls back to LIVEKIT_URL if not explicitly set.
 * Uses a getter (like the other config values) so that env vars are read
 * at call-time rather than module-load time — important in serverless.
 */
export function getLiveKitPublicUrl(): string {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
  if (!url) {
    console.warn("[livekit:config] Neither NEXT_PUBLIC_LIVEKIT_URL nor LIVEKIT_URL is set — client connections will fail");
    return "";
  }
  return url;
}

/** Returns true when all three LiveKit env vars are configured. */
export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
  );
}

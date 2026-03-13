import { isLiveKitConfigured } from "@/lib/livekit/config";
import type { RoomTransport } from "./types";

export type TransportMode = "livekit";

/**
 * All calls use LiveKit. Returns "livekit" if configured,
 * throws if LiveKit is not configured.
 */
export function determineTransportMode(): TransportMode {
  if (!isLiveKitConfigured()) {
    throw new Error(
      "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }
  return "livekit";
}

/**
 * Creates a LiveKitTransport instance.
 * Uses dynamic import so livekit-client is only loaded when needed.
 */
export async function createLiveKitTransport(
  livekitUrl: string,
  token: string,
): Promise<RoomTransport> {
  const { LiveKitTransport } = await import("./livekit-transport");
  return new LiveKitTransport(livekitUrl, token);
}

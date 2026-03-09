import {
  PARTICIPANT_THRESHOLD,
  isLiveKitConfigured,
} from "@/lib/livekit/config";
import type { RoomTransport } from "./types";

export type TransportMode = "p2p" | "livekit";

/**
 * Determines which transport mode to use.
 *
 * - If LiveKit is not configured → always P2P.
 * - If maxParticipants >= PARTICIPANT_THRESHOLD → LiveKit.
 * - Otherwise → P2P.
 */
export function determineTransportMode(maxParticipants: number): TransportMode {
  if (!isLiveKitConfigured()) return "p2p";
  return maxParticipants >= PARTICIPANT_THRESHOLD ? "livekit" : "p2p";
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

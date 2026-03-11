import {
  PARTICIPANT_THRESHOLD,
  isLiveKitConfigured,
} from "@/lib/livekit/config";
import type { RoomTransport } from "./types";

export type TransportMode = "p2p" | "livekit";

/**
 * Determines which transport mode to use based on the *actual*
 * number of joined participants (not the meeting's max capacity).
 *
 * - If LiveKit is not configured → always P2P.
 * - If participantCount >= PARTICIPANT_THRESHOLD → LiveKit.
 * - Otherwise → P2P.
 */
export function determineTransportMode(participantCount: number): TransportMode {
  if (!isLiveKitConfigured()) return "p2p";
  return participantCount >= PARTICIPANT_THRESHOLD ? "livekit" : "p2p";
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

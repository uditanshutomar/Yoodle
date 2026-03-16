import type { RoomTransport } from "./types";

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
